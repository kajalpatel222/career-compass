import type { NormalizedJob } from "./normalize";

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return normalizeText(trimmed).replace(/\/+$/, "");
  }
}

export function dedupeJobs(jobs: NormalizedJob[]) {
  const seenUrls = new Set<string>();
  const seenDetails = new Set<string>();

  return jobs.filter((job) => {
    const urlKey = normalizeUrl(job.url);
    const detailsKey = [job.title, job.company, job.location].map(normalizeText).join("|");
    if ((urlKey && seenUrls.has(urlKey)) || seenDetails.has(detailsKey)) return false;
    if (urlKey) seenUrls.add(urlKey);
    seenDetails.add(detailsKey);
    return true;
  });
}
