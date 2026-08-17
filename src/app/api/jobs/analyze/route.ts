import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobWithLLM, type AnalysisJob, type AnalysisProfile } from "@/lib/jobs/analyze";

const DEMO_EMAIL = "demo@personal-assistant.local";

type RequestBody = {
  jobIds?: string[];
  jobs?: Array<AnalysisJob & { id?: string }>;
  profile?: AnalysisProfile;
  persist?: boolean;
};

export async function POST(request: NextRequest) {
  const body = await request.json() as RequestBody;
  const suppliedJobs = body.jobs ?? [];
  let jobs: Array<AnalysisJob & { id?: string }> = suppliedJobs;
  let userId: string | null = null;
  let profile = body.profile;

  if (!suppliedJobs.length || !profile) {
    if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Provide jobs and a profile, or configure DATABASE_URL." }, { status: 503 });
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { candidateProfile: true } });
    if (!user) return NextResponse.json({ error: "The demo user has not been created yet. Search for jobs first." }, { status: 404 });
    userId = user.id;
    profile ??= user.candidateProfile
      ? { ...user.candidateProfile, resumeText: user.candidateProfile.resumeText ?? undefined }
      : undefined;
    if (!profile) return NextResponse.json({ error: "No candidate profile is available for analysis." }, { status: 400 });
    if (!suppliedJobs.length) {
      jobs = await prisma.job.findMany({ where: { userId: user.id, ...(body.jobIds?.length ? { id: { in: body.jobIds } } : {}) }, orderBy: { createdAt: "desc" } });
    }
  }

  if (!profile) return NextResponse.json({ error: "A candidate profile is required." }, { status: 400 });
  let results: Array<AnalysisJob & { id?: string; analysis: Awaited<ReturnType<typeof analyzeJobWithLLM>> }>;
  try {
    results = await Promise.all(jobs.map(async (job) => ({ id: job.id, ...job, analysis: await analyzeJobWithLLM(profile as AnalysisProfile, job) })));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LLM analysis failed." }, { status: 502 });
  }

  if (userId && body.persist !== false) {
    await Promise.all(results.filter((result): result is typeof result & { id: string } => Boolean(result.id)).map((result) => prisma.jobAnalysis.upsert({
      where: { jobId: result.id },
      update: result.analysis,
      create: { jobId: result.id, ...result.analysis },
    })));
  }

  return NextResponse.json({ jobs: results, persisted: Boolean(userId && body.persist !== false) });
}
