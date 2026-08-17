import type { NormalizedJob } from "@/lib/jobs/normalize";

export type JobSourceSearchInput = {
  query: string;
  location: string;
  limit: number;
  postedToday?: boolean;
  signal?: AbortSignal;
};

export type JobSourceResult = {
  source: string;
  jobs: NormalizedJob[];
  error?: string;
};
