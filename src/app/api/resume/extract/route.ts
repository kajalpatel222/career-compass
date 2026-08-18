import { NextResponse } from "next/server";
import { createRequire } from "module";

export const runtime = "nodejs";
const require = createRequire(import.meta.url);
const mammoth = require("mammoth");
const parsePdf = require("pdf-parse");

function normalizeText(value: string) {
  return value
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

async function extractPdfText(buffer: Buffer) {
  // pdf-parse v1 uses the Node-compatible PDF.js build. Newer builds expect
  // browser DOM globals (such as DOMMatrix) during Vercel module evaluation.
  const result = await parsePdf(buffer);
  return result.text || "";
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
