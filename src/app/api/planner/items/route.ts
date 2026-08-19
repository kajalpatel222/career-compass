import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_EMAIL = "demo@personal-assistant.local";
const VALID_DURATIONS = new Set([15, 30, 45, 60, 90, 120]);

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) return NextResponse.json({ items: [] });
    const items = await prisma.plannerItem.findMany({
      where: { userId: user.id, status: { not: "DISMISSED" } },
      orderBy: [{ scheduledStart: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[planner] items could not be loaded", error);
    return NextResponse.json({ error: "Your plan could not be loaded." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { title?: string; details?: string; durationMinutes?: number };
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "Add a short description of what you want to do." }, { status: 400 });
    const durationMinutes = VALID_DURATIONS.has(Number(body.durationMinutes)) ? Number(body.durationMinutes) : 30;
    const user = await prisma.user.upsert({ where: { email: DEMO_EMAIL }, update: {}, create: { email: DEMO_EMAIL } });
    const item = await prisma.plannerItem.create({
      data: {
        userId: user.id,
        title: title.slice(0, 160),
        details: body.details?.trim().slice(0, 1000) || null,
        durationMinutes,
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[planner] item could not be created", error);
    return NextResponse.json({ error: "That planning item could not be saved." }, { status: 502 });
  }
}
