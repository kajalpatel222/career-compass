import { NextResponse } from "next/server";
import { createRequire } from "module";

export const runtime = "nodejs";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");

function normalizeText(value: string) {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function extractPdfText(buffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    disableFontFace: true,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = (await page.getTextContent()) as {
      items: Array<{ str?: string }>;
    };
    const pageText = textContent.items
      .map((item) => item.str || "")
      .join(" ");
    if (pageText.trim()) {
      chunks.push(pageText);
    }
  }

  await loadingTask.destroy();
  return chunks.join("\n");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return NextResponse.json({ error: "Please upload a resume file." }, { status: 400 });
    }

    const fileName = resume.name.toLowerCase();
    const arrayBuffer = await resume.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = "";
    if (fileName.endsWith(".pdf")) {
      text = await extractPdfText(buffer);
      if (!text.trim()) {
        return NextResponse.json(
          {
            error:
              "This PDF does not contain readable text. Please upload a text-based PDF or a DOCX resume.",
          },
          { status: 422 },
        );
      }
    } else if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || "";
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "We could not extract readable text from that resume." },
        { status: 422 },
      );
    }

    return NextResponse.json({ text: normalizeText(text) });
  } catch (error) {
    console.error("[resume:extract]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Resume text could not be extracted.",
      },
      { status: 500 },
    );
  }
}
