export type AnalysisProfile = {
  targetRoles?: string[];
  skills?: string[];
  searchKeywords?: string[];
  preferredLocations?: string[];
  workModes?: string[];
  minimumSalary?: number | null;
  resumeText?: string;
};

export type AnalysisJob = {
  role: string;
  company: string;
  location?: string | null;
  description?: string | null;
  salary?: string | null;
};

export type JobAnalysisResult = {
  matchScore: number;
  recommendation: string;
  strengths: string[];
  gaps: string[];
  concerns: string[];
  reasoning: string;
  modelUsed?: string;
};

export function passesHardFilters(profile: AnalysisProfile, job: AnalysisJob) {
  const salary = parseSalary(job.salary);
  const salaryMatches = profile.minimumSalary == null || salary == null || salary >= profile.minimumSalary;
  return salaryMatches;
}

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
const includesPhrase = (haystack: string, needle: string) => {
  const target = clean(needle);
  return target.length > 1 && clean(haystack).includes(target);
};

const overlap = (haystack: string, values: string[]) => values.filter((value) => includesPhrase(haystack, value));

const parseSalary = (salary?: string | null) => {
  if (!salary) return null;
  const numbers = salary.replace(/,/g, "").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!numbers.length) return null;
  const annual = numbers.every((number) => number < 1000) ? Math.max(...numbers) * 1000 : Math.max(...numbers);
  return annual;
};

const roleMatches = (jobRole: string, roles: string[]) => roles.some((role) => includesPhrase(jobRole, role) || includesPhrase(role, jobRole));

export function analyzeJob(profile: AnalysisProfile, job: AnalysisJob): JobAnalysisResult {
  const roles = profile.targetRoles ?? [];
  const resumeSignals = extractResumeSignals(profile.resumeText ?? "");
  const skills = [...(profile.skills ?? []), ...(profile.searchKeywords ?? []), ...resumeSignals];
  const locationPreferences = profile.preferredLocations ?? [];
  const jobText = [job.role, job.description, job.location, profile.resumeText].filter(Boolean).join(" ");
  const sponsorshipMatch = /visa sponsorship|sponsor.*visa|h-?1b sponsorship/i.test(jobText);
  const matchedSkills = overlap(jobText, skills);
  const missingSkills = skills.filter((skill) => !matchedSkills.includes(skill));
  const roleMatch = roles.length === 0 || roleMatches(job.role, roles);
  const locationMatch = locationPreferences.length === 0 || locationPreferences.some((location) => includesPhrase(job.location ?? "", location) || includesPhrase(location, job.location ?? ""));
  const workModeMatch = (profile.workModes ?? []).length === 0 || (profile.workModes ?? []).some((mode) => includesPhrase(jobText, mode));
  const salary = parseSalary(job.salary);
  const salaryMatch = profile.minimumSalary == null || salary == null || salary >= profile.minimumSalary;

  const rolePoints = roleMatch ? 35 : 0;
  const skillPoints = skills.length ? Math.round((matchedSkills.length / skills.length) * 40) : 40;
  const locationPoints = locationMatch ? 15 : 0;
  const workModePoints = workModeMatch ? 5 : 0;
  const salaryPoints = salaryMatch ? 5 : 0;
  const matchScore = Math.max(0, Math.min(100, rolePoints + skillPoints + locationPoints + workModePoints + salaryPoints));

  const strengths = [
    ...(roleMatch && roles.length ? [`Role aligns with ${roles.find((role) => roleMatches(job.role, [role])) ?? "a target role"}.`] : []),
    ...(matchedSkills.length ? [`Mentions ${matchedSkills.join(", ")}.`] : []),
    ...(locationMatch && locationPreferences.length ? ["Location matches your preference."] : []),
    ...(sponsorshipMatch ? ["Posting explicitly mentions visa sponsorship."] : []),
    "Match score considers role, skills, location, and compensation.",
  ];
  const gaps = [
    ...(!roleMatch && roles.length ? [`Role does not clearly match: ${roles.join(", ")}.`] : []),
    ...(missingSkills.length ? [`Skills not found in the posting: ${missingSkills.join(", ")}.`] : []),
    ...(!locationMatch && locationPreferences.length ? ["Location does not match your stated preference."] : []),
  ];
  const concerns = [
    ...(salary == null && profile.minimumSalary != null ? ["Salary is not disclosed, so the minimum cannot be verified."] : []),
    ...(salary != null && profile.minimumSalary != null && salary < profile.minimumSalary ? [`Listed compensation may be below your minimum of ${profile.minimumSalary}.`] : []),
    ...(!workModeMatch && (profile.workModes ?? []).length ? ["The preferred work mode is not clearly mentioned."] : []),
  ];
  const recommendation = matchScore >= 80 ? "Strongly recommended" : matchScore >= 65 ? "Worth exploring" : matchScore >= 50 ? "Possible fit" : "Low priority";
  const reasoning = `${recommendation}: ${matchScore}/100 based on role alignment (${rolePoints}/35), skill overlap (${skillPoints}/40), location (${locationPoints}/15), work mode (${workModePoints}/5), and compensation (${salaryPoints}/5).`;

  return { matchScore, recommendation, strengths, gaps, concerns, reasoning };
}

function extractResumeSignals(resumeText: string) {
  const stopwords = new Set([
    "the", "and", "with", "for", "from", "that", "this", "you", "your", "are", "was", "were", "has", "have", "had",
    "but", "not", "all", "any", "can", "will", "our", "their", "them", "they", "she", "him", "her", "his", "hers",
    "team", "work", "worked", "working", "experience", "skills", "skill", "role", "roles", "resume", "phone", "email",
  ]);
  const counts = new Map<string, number>();
  for (const rawToken of resumeText.toLowerCase().split(/[^a-z0-9+#.]+/g)) {
    const token = rawToken.trim();
    if (token.length < 3 || stopwords.has(token)) continue;
    if (!/[a-z]/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 20);
}

function parseAnalysis(value: unknown): JobAnalysisResult {
  if (!value || typeof value !== "object") throw new Error("The model returned an invalid analysis.");
  const result = value as Record<string, unknown>;
  const matchScore = Number(result.matchScore);
  if (!Number.isFinite(matchScore) || typeof result.recommendation !== "string" || typeof result.reasoning !== "string") {
    throw new Error("The model returned an incomplete analysis.");
  }
  const asStrings = (field: string) => Array.isArray(result[field]) ? result[field].filter((item): item is string => typeof item === "string") : [];
  return {
    matchScore: Math.max(0, Math.min(100, Math.round(matchScore))),
    recommendation: result.recommendation,
    strengths: asStrings("strengths"),
    gaps: asStrings("gaps"),
    concerns: asStrings("concerns"),
    reasoning: result.reasoning,
  };
}

export async function analyzeJobWithLLM(profile: AnalysisProfile, job: AnalysisJob): Promise<JobAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY must be configured.");

  const request = () => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful career-matching assistant. Evaluate the candidate against the job using only the supplied information. Do not invent experience. Return only valid JSON with keys matchScore (integer 0-100), recommendation, strengths (array of strings), gaps (array of strings), concerns (array of strings), and reasoning (string). Return exactly 3 strengths; include visa sponsorship as a strength only if the posting explicitly mentions it. Keep each item under 12 words and reasoning under 30 words." },
        { role: "user", content: JSON.stringify({ candidateProfile: profile, resumeText: profile.resumeText, job }) },
      ],
    }),
  });
  let response = await request();
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await request();
  }
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter returned ${response.status}.${responseText ? ` ${responseText.slice(0, 200)}` : ""}`);
  }

  let payload: { model?: string; choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = JSON.parse(responseText) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
  } catch {
    throw new Error(`OpenRouter returned invalid JSON.${responseText ? ` ${responseText.slice(0, 200)}` : ""}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The model returned no analysis.");

  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new Error(`The model returned non-JSON content.${content.slice(0, 200)}`);
  }

  return { ...parseAnalysis(parsedContent), modelUsed: payload.model || model };
}
