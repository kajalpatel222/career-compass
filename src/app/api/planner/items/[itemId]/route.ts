import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_EMAIL = "demo@personal-assistant.local";
const VALID_STATUSES = new Set(["INBOX", "SCHEDULED", "COMPLETED", "DISMISSED"]);
const VALID_DURATIONS = new Set([15, 30, 45, 60, 90, 120]);

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const [{ itemId }, body] = await Promise.all([
      params,
      request.json() as Promise<{ status?: string; scheduledStart?: string | null; durationMinutes?: number }>,
    ]);
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) return NextResponse.json({ error: "Planner profile was not found." }, { status: 404 });
    const existing = await prisma.plannerItem.findFirst({ where: { id: itemId, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Planning item was not found." }, { status: 404 });

    const durationMinutes = VALID_DURATIONS.has(Number(body.durationMinutes)) ? Number(body.durationMinutes) : existing.durationMinutes;
    const status = body.status && VALID_STATUSES.has(body.status) ? body.status : existing.status;
    let scheduledStart = existing.scheduledStart;
    let scheduledEnd = existing.scheduledEnd;
    if (body.scheduledStart === null || status === "INBOX") {
      scheduledStart = null;
      scheduledEnd = null;
    } else if (body.scheduledStart) {
      const parsedStart = new Date(body.scheduledStart);
      if (Number.isNaN(parsedStart.getTime())) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400 });
      scheduledStart = parsedStart;
      scheduledEnd = new Date(parsedStart.getTime() + durationMinutes * 60_000);
    }

    const item = await prisma.plannerItem.update({
      where: { id: existing.id },
      data: { status, durationMinutes, scheduledStart, scheduledEnd },
    });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[planner] item could not be updated", error);
    return NextResponse.json({ error: "That planning item could not be updated." }, { status: 502 });
  }
}
