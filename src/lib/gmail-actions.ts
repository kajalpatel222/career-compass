export type ActionableEmail = {
  category: string;
  sender: string | null;
  subject: string | null;
  snippet: string | null;
  isUnread: boolean;
  threadHasReply: boolean;
  receivedAt: Date | string | null;
};

export type EmailActionPlan = {
  actionType: "REPLY" | "FOLLOW_UP" | "REVIEW";
  priority: number;
  priorityReason: string;
};

export type EmailTriageMessage = ActionableEmail & { gmailMessageId: string };

export function planEmailAction(message: ActionableEmail): EmailActionPlan | null {
  const content = `${message.sender || ""} ${message.subject || ""} ${message.snippet || ""}`.toLowerCase();
  const isInformational = /job alert|newsletter|digest|people you may know|recommended jobs|thank you for applying|application received/.test(content);
  const isCareerRelated = /\b(job|career|role|recruiter|hiring|interview|application|assessment|offer|position|employer)\b/.test(content);
  const hasDeadlineOrSubmission = /deadline|due date|due by|respond by|action required|complete (?:the )?(?:assessment|application)|submit|submission|assessment|take-home|coding challenge|rsvp/.test(content);
  const isLinkedInInMail = (message.sender || "").toLowerCase().includes("inmail-hit-reply@linkedin.com");
  const daysSinceLastActivity = message.receivedAt ? Math.floor((Date.now() - new Date(message.receivedAt).getTime()) / 86_400_000) : 0;

  if (message.category === "REJECTED" || isInformational) return null;
  const unreadBoost = message.isUnread ? 8 : 0;

  if (message.category === "OFFER" && !message.threadHasReply) return { actionType: "REPLY", priority: Math.min(100, 92 + unreadBoost), priorityReason: "Offer-related message needs prompt review and a response." };
  if (message.category === "INTERVIEW" && !message.threadHasReply) return { actionType: "REPLY", priority: Math.min(100, 88 + unreadBoost), priorityReason: message.isUnread ? "Unread interview-related message has no reply in the thread." : "Interview-related message has no reply in the thread." };
  if (isLinkedInInMail && !message.threadHasReply) return { actionType: "REPLY", priority: Math.min(100, 74 + unreadBoost), priorityReason: "LinkedIn InMail needs a response." };
  if (message.category === "OUTREACH" && !message.threadHasReply) return { actionType: "REPLY", priority: Math.min(100, 74 + unreadBoost), priorityReason: message.isUnread ? "Unread recruiter outreach has no reply in the thread." : "Recruiter outreach has no reply in the thread." };
  if (message.threadHasReply && isCareerRelated && daysSinceLastActivity >= 3) return { actionType: "FOLLOW_UP", priority: Math.min(100, 65 + unreadBoost + Math.min(daysSinceLastActivity - 3, 12)), priorityReason: `Your last message in this career conversation was ${daysSinceLastActivity} days ago.` };
  if (isCareerRelated && hasDeadlineOrSubmission) return { actionType: "REVIEW", priority: Math.min(100, 78 + unreadBoost), priorityReason: "Career-related deadline, submission, or event needs review." };
  return null;
}

function isObviousInformational(message: ActionableEmail) {
  const content = `${message.sender || ""} ${message.subject || ""} ${message.snippet || ""}`.toLowerCase();
  return message.category === "REJECTED" || /job alert|newsletter|digest|people you may know|recommended jobs|thank you for applying|application received/.test(content);
}

function parseTriageResponse(value: unknown, allowedIds: Set<string>) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown[] }).items)) {
    throw new Error("The model returned an invalid email triage response.");
  }

  const plans = new Map<string, EmailActionPlan | null>();
  for (const rawItem of (value as { items: unknown[] }).items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const gmailMessageId = typeof item.gmailMessageId === "string" ? item.gmailMessageId : "";
    if (!allowedIds.has(gmailMessageId)) continue;
    if (item.include !== true) {
      plans.set(gmailMessageId, null);
      continue;
    }
    const actionType = item.actionType;
    const priority = Number(item.priority);
    const priorityReason = item.priorityReason;
    if ((actionType !== "REPLY" && actionType !== "FOLLOW_UP" && actionType !== "REVIEW") || !Number.isFinite(priority) || typeof priorityReason !== "string") continue;
    plans.set(gmailMessageId, {
      actionType,
      priority: Math.max(0, Math.min(100, Math.round(priority))),
      priorityReason: priorityReason.slice(0, 180),
    });
  }
  return plans;
}

export async function triageEmailActionsWithLLM(messages: EmailTriageMessage[]) {
  const eligible = messages.filter((message) => !isObviousInformational(message));
  const results = new Map<string, EmailActionPlan | null>();
  messages.filter(isObviousInformational).forEach((message) => results.set(message.gmailMessageId, null));
  if (!eligible.length) return results;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    eligible.forEach((message) => results.set(message.gmailMessageId, planEmailAction(message)));
    return results;
  }

  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const chunks = Array.from({ length: Math.ceil(eligible.length / 25) }, (_, index) => eligible.slice(index * 25, index * 25 + 25));

  for (const chunk of chunks) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You triage a candidate's career email. Include only messages that need a concrete action: reply to recruiter/interviewer, follow up, review an interview/offer/assessment/deadline, or career event requiring a response. Exclude newsletters, job alerts, articles, Substack posts, generic resources, application confirmations, marketing, invitations without an actionable request, and messages that are only informational. Respect threadHasReply and receivedAt. Return only valid JSON: {items:[{gmailMessageId,include,actionType,priority,priorityReason}]}. actionType is REPLY, FOLLOW_UP, or REVIEW. priority is 0-100. priorityReason is under 20 words. Use only supplied data." },
            { role: "user", content: JSON.stringify({ emails: chunk.map(({ gmailMessageId, sender, subject, snippet, category, isUnread, threadHasReply, receivedAt }) => ({ gmailMessageId, sender, subject, snippet: snippet?.slice(0, 700) || null, category, isUnread, threadHasReply, receivedAt })) }) },
          ],
        }),
      });
      const responseText = await response.text();
      if (!response.ok) throw new Error(`OpenRouter returned ${response.status}.`);
      const payload = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("The model returned no email triage.");
      const plans = parseTriageResponse(JSON.parse(content), new Set(chunk.map((message) => message.gmailMessageId)));
      chunk.forEach((message) => results.set(message.gmailMessageId, plans.get(message.gmailMessageId) ?? planEmailAction(message)));
    } catch (error) {
      console.error("[gmail] LLM triage failed; using rule fallback", error);
      chunk.forEach((message) => results.set(message.gmailMessageId, planEmailAction(message)));
    }
  }

  return results;
}

function recipientName(sender: string | null) {
  const displayName = sender?.replace(/<[^>]+>/, "").replace(/[\"']/g, "").trim();
  return displayName && !displayName.includes("@") ? displayName.split(/\s+/)[0] : null;
}

export async function generateReplyDraft(input: { actionType: string; sender: string | null; subject: string | null; snippet: string | null; signatureName: string; signatureEmail: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY must be configured to generate a draft.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [
        { role: "system", content: "You write concise, polished job-search email bodies. Use only supplied information; never invent names, dates, availability, or job details. Return only the body: no greeting, sign-off, signature, or subject line. Keep it under 110 words. Do not claim the candidate has accepted an offer or committed to a time." },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`OpenRouter returned ${response.status}.`);
  const payload = JSON.parse(raw) as { model?: string; choices?: { message?: { content?: string } }[] };
  const draftText = payload.choices?.[0]?.message?.content?.trim();
  if (!draftText) throw new Error("The model returned an empty draft.");
  const greeting = recipientName(input.sender) ? `Hi ${recipientName(input.sender)},` : "Hello,";
  const signedDraft = `${greeting}\n\n${draftText}\n\nBest,\n${input.signatureName}\n${input.signatureEmail}`;
  return { draftText: signedDraft, modelUsed: payload.model || model };
}
