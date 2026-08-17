import { normalizeJobs } from "@/lib/jobs/normalize";
import type { JobSourceResult, JobSourceSearchInput } from "@/lib/jobs/sources/types";

const DEFAULT_ACTOR_ID = "themineworks~linkedin-jobs-scraper";

type LinkedInActorJob = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return undefined;
}

function toNormalizedInput(job: LinkedInActorJob) {
  return {
    title: firstText(job.title, job.jobTitle, job.job_title, job.position),
    company: firstText(job.company, job.companyName, job.company_name, job.employer),
    location: firstText(job.location, job.jobLocation, job.job_location),
    description: firstText(job.description, job.jobDescription, job.job_description, job.descriptionText, job.snippet),
    salary: firstText(job.salary, job.salaryText, job.salary_range, job.salaryRange),
    url: firstText(job.job_url, job.jobUrl, job.url, job.applyUrl, job.apply_url),
    postedAt: firstText(job.postedAt, job.posted_at, job.datePosted, job.date_posted, job.listedAt, job.listed_at),
    posted: firstText(job.posted, job.postedAgo, job.posted_ago, job.timeAgo),
    source: "LinkedIn",
  };
}

export async function searchLinkedInJobs({ query, location, limit, signal }: JobSourceSearchInput): Promise<JobSourceResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return { source: "LinkedIn", jobs: [], error: "APIFY_API_TOKEN is not configured." };

  const actorId = process.env.APIFY_LINKEDIN_ACTOR_ID || DEFAULT_ACTOR_ID;
  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          keywords: query,
          location,
          maxResults: limit,
          proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
        }),
      },
    );

    if (!response.ok) return { source: "LinkedIn", jobs: [], error: `LinkedIn returned ${response.status}.` };
    const items: unknown = await response.json();
    if (!Array.isArray(items)) return { source: "LinkedIn", jobs: [], error: "LinkedIn returned an invalid dataset." };
    return { source: "LinkedIn", jobs: normalizeJobs(items.map((item) => toNormalizedInput(item as LinkedInActorJob))).map((job) => ({ ...job, source: "LinkedIn" })) };
  } catch (error) {
    const isTimeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return { source: "LinkedIn", jobs: [], error: isTimeout ? "LinkedIn timed out." : "LinkedIn could not be reached." };
  }
}
