import { normalizeJobs } from "@/lib/jobs/normalize";
import type { JobSourceResult, JobSourceSearchInput } from "@/lib/jobs/sources/types";

const DEFAULT_ACTOR_ID = "schnellscrapers~indeed-jobs-scraper";

export async function searchIndeedJobs({ query, location, limit, postedToday, signal }: JobSourceSearchInput): Promise<JobSourceResult> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { source: "Indeed", jobs: [], error: "APIFY_API_TOKEN is not configured." };
  }

  const actorId = process.env.APIFY_INDEED_ACTOR_ID || DEFAULT_ACTOR_ID;
  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        searches: [{ query, location, country: "US", ...(postedToday ? { postedWithinDays: 1, sort: "date" } : {}) }],
        maxRecords: limit,
        maxPagesPerSearch: 1,
      }),
    });

    if (!response.ok) {
      return { source: "Indeed", jobs: [], error: `Indeed returned ${response.status}.` };
    }

    return {
      source: "Indeed",
      jobs: normalizeJobs(await response.json()).map((job) => ({ ...job, source: "Indeed" })),
    };
  } catch (error) {
    const isTimeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    return {
      source: "Indeed",
      jobs: [],
      error: isTimeout ? "Indeed timed out." : "Indeed could not be reached.",
    };
  }
}
