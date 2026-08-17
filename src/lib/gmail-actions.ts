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
  if (message.threadHasReply && isCareerRelated && daysSinceLastActivity >= 7) return { actionType: "FOLLOW_UP", priority: Math.min(100, 65 + unreadBoost + Math.min(daysSinceLastActivity - 7, 12)), priorityReason: `Your last message in this career conversation was ${daysSinceLastActivity} days ago.` };
  if (isCareerRelated && hasDeadlineOrSubmission) return { actionType: "REVIEW", priority: Math.min(100, 78 + unreadBoost), priorityReason: "Career-related deadline, submission, or event needs review." };
  return null;
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
