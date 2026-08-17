import { normalizeJobs } from "@/lib/jobs/normalize";
import type { JobSourceResult, JobSourceSearchInput } from "@/lib/jobs/sources/types";

const DEFAULT_ACTOR_ID = "deadlyaccurate~ashby-jobs-scraper";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchAshbyJobs({ query, location, limit, signal }: JobSourceSearchInput): Promise<JobSourceResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { source: "Ashby", jobs: [], error: "APIFY_API_TOKEN is not configured." };
  }

  const actorId = process.env.APIFY_ASHBY_ACTOR_ID || DEFAULT_ACTOR_ID;
  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        mode: "all",
        keywordFilter: escapeRegex(query.trim()),
        locationFilter: escapeRegex(location.trim()),
      }),
    });

    if (!response.ok) {
      return { source: "Ashby", jobs: [], error: `Ashby returned ${response.status}.` };
    }

    const jobs = normalizeJobs(await response.json())
      .map((job) => ({ ...job, source: "Ashby" }))
      .slice(0, Math.max(0, limit));
    return { source: "Ashby", jobs };
  } catch (error) {
    const isTimeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return { source: "Ashby", jobs: [], error: isTimeout ? "Ashby timed out." : "Ashby could not be reached." };
  }
}
