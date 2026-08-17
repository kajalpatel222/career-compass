import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_EMAIL = "demo@personal-assistant.local";
const CATEGORIES = new Set(["APPLICATION", "OUTREACH", "INTERVIEW", "OFFER", "REJECTED", "JOB_RELATED"]);
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category") || "all";
  if (category !== "all" && !CATEGORIES.has(category)) return NextResponse.json({ error: "Invalid inbox category." }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) return NextResponse.json({ messages: [], total: 0 });
    const where = { userId: user.id, ...(category === "all" ? {} : { category }) };
    const [messages, total] = await Promise.all([
      prisma.gmailMessage.findMany({ where, orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }], take: 50 }),
      prisma.gmailMessage.count({ where }),
    ]);
    return NextResponse.json({ messages, total });
  } catch (error) {
    console.error("[gmail] inbox read failed", error);
    return NextResponse.json({ error: "Gmail inbox could not be loaded." }, { status: 502 });
  }
}
