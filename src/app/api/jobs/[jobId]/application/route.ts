import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_USER_EMAIL = "demo@personal-assistant.local";
const allowedStatuses = new Set(["SAVED", "APPLIED", "NOT_PURSUING"]);

export async function POST(request: NextRequest, context: RouteContext<"/api/jobs/[jobId]/application">) {
  const { jobId } = await context.params;
  const body = await request.json() as { status?: string };
  if (!body.status || !allowedStatuses.has(body.status)) return NextResponse.json({ error: "A valid application status is required." }, { status: 400 });
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
    const job = await prisma.job.findFirst({ where: { id: jobId, userId: user?.id } });
    if (!user || !job) return NextResponse.json({ error: "Job was not found." }, { status: 404 });
    const application = await prisma.application.upsert({
      where: { userId_jobId: { userId: user.id, jobId } },
      update: { status: body.status, appliedAt: body.status === "APPLIED" ? new Date() : null },
      create: { userId: user.id, jobId, status: body.status, appliedAt: body.status === "APPLIED" ? new Date() : null },
    });
    return NextResponse.json({ status: application.status, appliedAt: application.appliedAt });
  } catch (error) {
    console.error("[application:update]", error);
    return NextResponse.json({ error: "Application status could not be saved." }, { status: 502 });
  }
}
