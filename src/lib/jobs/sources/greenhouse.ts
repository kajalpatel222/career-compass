import { normalizeJobs } from "@/lib/jobs/normalize";
import type { JobSourceResult, JobSourceSearchInput } from "@/lib/jobs/sources/types";

const DEFAULT_ACTOR_ID = "deadlyaccurate~greenhouse-jobs-scraper";

type GreenhouseActorJob = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nestedText(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return text((value as Record<string, unknown>)[key]);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toNormalizedInput(job: GreenhouseActorJob) {
  const location = job.location;
  const company = job.company;

  return {
    title: firstText(job.title, job.jobTitle, job.positionName),
    company: firstText(job.companyName, job.company_name, job.boardToken, text(company), nestedText(company, "name")),
    location: firstText(text(location), nestedText(location, "name"), nestedText(location, "displayName"), job.locationName),
    description: firstText(job.description, job.contentText, job.content, job.jobDescription),
    salary: firstText(text(job.salary), nestedText(job.salary, "text"), nestedText(job.salary, "label"), job.salaryText),
    url: firstText(job.applyUrl, job.apply_url, job.absolute_url, job.url, job.jobUrl),
    source: "Greenhouse",
    postedAt: firstText(job.updatedAt, job.updated_at, job.firstPublished, job.first_published),
  };
}

export async function searchGreenhouseJobs({ query, location, limit, signal }: JobSourceSearchInput): Promise<JobSourceResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return { source: "Greenhouse", jobs: [], error: "APIFY_API_TOKEN is not configured." };

  const actorId = process.env.APIFY_GREENHOUSE_ACTOR_ID || DEFAULT_ACTOR_ID;
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          mode: "all",
          keywordFilter: escapeRegex(query.trim()),
          locationFilter: escapeRegex(location.trim()),
          includeContent: true,
          outputFormat: "unified",
          maxCompanies: Math.max(limit * 10, 50),
        }),
      },
    );

    if (!response.ok) {
      return { source: "Greenhouse", jobs: [], error: `Greenhouse returned ${response.status}.` };
    }

    const items: unknown = await response.json();
    if (!Array.isArray(items)) {
      return { source: "Greenhouse", jobs: [], error: "Greenhouse returned an invalid dataset." };
    }

    const jobs = normalizeJobs(items.slice(0, limit).map((item) => toNormalizedInput(item as GreenhouseActorJob))).map((job) => ({
      ...job,
      source: "Greenhouse",
    }));
    return { source: "Greenhouse", jobs };
  } catch (error) {
    const isTimeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return { source: "Greenhouse", jobs: [], error: isTimeout ? "Greenhouse timed out." : "Greenhouse could not be reached." };
  }
}
