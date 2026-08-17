import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJob, analyzeJobWithLLM, type AnalysisProfile } from "@/lib/jobs/analyze";
import { dedupeJobs } from "@/lib/jobs/dedupe";
import { wasPostedInLastDay } from "@/lib/jobs/normalize";
import { searchLinkedInJobs } from "@/lib/jobs/sources/linkedin";

export const maxDuration = 60;

const DEMO_EMAIL = "demo@personal-assistant.local";
const MAX_RESULTS = Math.min(Math.max(Number.parseInt(process.env.LINKEDIN_RESULTS_PER_SEARCH || "10", 10) || 10, 1), 25);
type RequestBody = { roles?: string; locations?: string; keywords?: string; workMode?: string; minimumSalary?: string; resumeText?: string; postedToday?: boolean };

function databaseIsRemote() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;
  try { return !["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl).hostname); } catch { return true; }
}

function profileFrom(body: RequestBody): AnalysisProfile {
  return { targetRoles: body.roles?.split(",").map((value) => value.trim()).filter(Boolean) ?? [], skills: body.keywords?.split(",").map((value) => value.trim()).filter(Boolean) ?? [], searchKeywords: body.keywords?.split(",").map((value) => value.trim()).filter(Boolean) ?? [], preferredLocations: body.locations?.split(",").map((value) => value.trim()).filter(Boolean) ?? [], workModes: body.workMode ? [body.workMode] : [], minimumSalary: Number.parseInt(body.minimumSalary?.replace(/[^0-9]/g, "") || "", 10) || null, resumeText: body.resumeText || "" };
}

export async function GET() {
  if (!databaseIsRemote()) return NextResponse.json({ available: false, error: "A remote Postgres database is required to protect Scan LinkedIn credits." }, { status: 503 });
  try {
    return NextResponse.json({ available: true, canSearch: true });
  } catch (error) { return NextResponse.json({ available: false, error: error instanceof Error ? error.message : "Scan LinkedIn status is unavailable." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!process.env.APIFY_API_TOKEN) return NextResponse.json({ error: "APIFY_API_TOKEN is not configured yet." }, { status: 503 });
  if (!databaseIsRemote()) return NextResponse.json({ error: "A remote Postgres database is required to save LinkedIn results." }, { status: 503 });
  const body = await request.json() as RequestBody;
  const query = [body.roles, body.keywords].filter(Boolean).join(" ").trim(); const location = body.locations?.split(",")[0]?.trim();
  if (!query || !location) return NextResponse.json({ error: "Target roles and a location are required." }, { status: 400 });
  try {
    const user = await prisma.user.upsert({ where: { email: DEMO_EMAIL }, update: {}, create: { email: DEMO_EMAIL } });
    let profile = profileFrom(body);
    const existingProfile = await prisma.candidateProfile.findUnique({ where: { userId: user.id }, select: { resumeText: true } });
    if (!profile.resumeText && existingProfile?.resumeText) profile = { ...profile, resumeText: existingProfile.resumeText };
    await prisma.candidateProfile.upsert({ where: { userId: user.id }, update: profile, create: { userId: user.id, ...profile } });
    const result = await searchLinkedInJobs({ query, location, limit: MAX_RESULTS, postedToday: body.postedToday ?? true, signal: AbortSignal.timeout(45_000) });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 });
    const jobs = dedupeJobs(result.jobs).filter(wasPostedInLastDay);
    const processed = await Promise.all(jobs.map(async (job) => {
      const analysisInput = { role: job.title, company: job.company, location: job.location, description: job.description, salary: job.salary };
      let analysis; try { analysis = await analyzeJobWithLLM(profile, analysisInput); } catch { analysis = analyzeJob(profile, analysisInput); }
      const existing = job.url ? await prisma.job.findFirst({ where: { userId: user.id, url: job.url } }) : null;
      const saved = existing ? await prisma.job.update({ where: { id: existing.id }, data: { company: job.company, role: job.title, description: job.description, salary: job.salary, location: job.location, source: "LinkedIn", postedAt: job.postedAt } }) : await prisma.job.create({ data: { userId: user.id, company: job.company, role: job.title, description: job.description, salary: job.salary, location: job.location, url: job.url || null, source: "LinkedIn", postedAt: job.postedAt } });
      const persistedAnalysis = { ...analysis }; delete persistedAnalysis.modelUsed;
      await prisma.jobAnalysis.upsert({ where: { jobId: saved.id }, update: persistedAnalysis, create: { jobId: saved.id, ...persistedAnalysis } });
      return { ...job, id: saved.id, analysis };
    }));
    return NextResponse.json({ jobs: processed.sort((a, b) => b.analysis.matchScore - a.analysis.matchScore), saved: processed.length });
  } catch (error) { console.error("[linkedin-search] failed", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Scan LinkedIn could not be completed." }, { status: 502 }); }
}
