import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEMO_USER_EMAIL = "demo@personal-assistant.local";

export async function GET(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ jobs: [], page: 1, pageSize: 10, total: 0, totalPages: 0, storage: "not_configured" });
    }

    const params = request.nextUrl.searchParams;
    const page = Math.max(Number.parseInt(params.get("page") || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(params.get("pageSize") || "10", 10) || 10, 1), 50);
    const query = params.get("q")?.trim();
    const source = params.get("source")?.trim();

    const user = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
    if (!user) {
      return NextResponse.json({ jobs: [], page, pageSize, total: 0, totalPages: 0, storage: "empty" });
    }

    const where = {
      userId: user.id,
      ...(source && source !== "all" ? { source } : {}),
      ...(query
        ? {
            OR: [
              { role: { contains: query, mode: "insensitive" as const } },
              { company: { contains: query, mode: "insensitive" as const } },
              { location: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { analysis: true, applications: { where: { userId: user.id } } },
        orderBy: [{ analysis: { matchScore: "desc" } }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        title: job.role,
        company: job.company,
        location: job.location || "Location not listed",
        description: job.description,
        url: job.url || "",
        salary: job.salary,
        posted: job.postedAt,
        source: job.source,
        savedAt: job.createdAt,
        applicationStatus: job.applications[0]?.status || "SAVED",
        appliedAt: job.applications[0]?.appliedAt || null,
        analysis: job.analysis ?? undefined,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      storage: "saved",
    });
  } catch (error) {
    console.error("[jobs:get]", error);
    return NextResponse.json({ jobs: [], page: 1, pageSize: 10, total: 0, totalPages: 0, storage: "unavailable", error: error instanceof Error ? error.message : "On your radar jobs could not be loaded." });
  }
}
