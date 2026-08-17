export type NormalizedJob = {
  title: string;
  company: string;
  location: string;
  description: string;
  salary: string | null;
  url: string;
  source: string;
  postedAt: string | null;
  posted: string | null;
};

const asText = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
};

const firstText = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return null;
};

const nestedText = (value: unknown, ...keys: string[]): string | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  return firstText(...keys.map((key) => record[key]));
};

export function normalizeJob(raw: unknown): NormalizedJob {
  const job = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const salaryValue = job.salary;
  const postedAt = firstText(
    job.postedAt,
    job.datePosted,
    job.postedDate,
    job.publishedAt,
    job.published_at,
    job.createdAt,
    job.created_at,
    job.updatedAt,
    job.updated_at,
    job.firstPublished,
    job.first_published,
  );
  const posted = firstText(job.postedRelative, job.posted, job.postedLabel, job.postedText, job.date);

  return {
    title: firstText(job.title, job.jobTitle, job.positionName) || "Untitled role",
    company: firstText(job.company, job.companyName, job.employer) || "Unknown company",
    location: firstText(job.location, job.jobLocation, job.city) || "Location not provided",
    description: firstText(job.description, job.jobDescription, job.snippet) || "",
    salary:
      firstText(
        salaryValue,
        nestedText(salaryValue, "text", "label", "value"),
        job.salaryText,
        job.salaryInfo,
      ),
    url: firstText(job.url, job.viewJobUrl, job.applyUrl, job.jobUrl) || "",
    source: firstText(job.source, job.sourceName) || "Indeed",
    postedAt,
    posted,
  };
}

export function normalizeJobs(rawJobs: unknown): NormalizedJob[] {
  return Array.isArray(rawJobs) ? rawJobs.map(normalizeJob) : [];
}

export function wasPostedInLastDay(job: NormalizedJob, now = Date.now()): boolean {
  const relativeDate = job.posted?.toLowerCase() || "";
  if (/\b(today|just posted|minutes? ago|hours? ago)\b/.test(relativeDate)) return true;

  if (!job.postedAt) return false;
  const postedTime = Date.parse(job.postedAt);
  return Number.isFinite(postedTime) && postedTime <= now && now - postedTime <= 24 * 60 * 60 * 1000;
}
