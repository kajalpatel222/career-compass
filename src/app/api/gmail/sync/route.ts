import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptRefreshToken, refreshAccessToken } from "@/lib/gmail";

const DEMO_EMAIL = "demo@personal-assistant.local";
const JOB_MAIL_QUERY = "newer_than:365d {\"application received\" \"thank you for applying\" \"job application\" \"next steps\" \"hiring team\" interview recruiter \"job opportunity\" from:linkedin.com from:greenhouse.io from:lever.co from:ashbyhq.com}";

type GmailMessageList = { messages?: { id: string; threadId: string }[] };
type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};

type GmailThread = { messages?: GmailMessage[] };
type ThreadState = { lastMessageSent: boolean; lastMessageAt: Date | null };

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || null;
}

function category(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/interview|schedule|calendar|meet with|availability/.test(text)) return "INTERVIEW";
  if (/offer|compensation|congratulations/.test(text)) return "OFFER";
  if (/rejection|unfortunately|not moving forward|other candidates/.test(text)) return "REJECTED";
  if (/recruiter|opportunity|would love to chat/.test(text)) return "OUTREACH";
  if (/application|applied|application received|next steps/.test(text)) return "APPLICATION";
  return "JOB_RELATED";
}

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { gmailConnection: true } });
    if (!user?.gmailConnection) return NextResponse.json({ error: "Connect Gmail before syncing." }, { status: 404 });

    const accessToken = (await refreshAccessToken(decryptRefreshToken(user.gmailConnection.refreshTokenEncrypted))).access_token!;
    const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: JOB_MAIL_QUERY, maxResults: "50" })}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!listResponse.ok) return NextResponse.json({ error: "Gmail could not list job-related messages." }, { status: 502 });
    const listed = await listResponse.json() as GmailMessageList;
    const items = listed.messages || [];

    const messages: GmailMessage[] = [];
    for (let start = 0; start < items.length; start += 10) {
      const batch = await Promise.all(items.slice(start, start + 10).map(async ({ id }) => {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
        return response.ok ? response.json() as Promise<GmailMessage> : null;
      }));
      messages.push(...batch.filter((message): message is GmailMessage => Boolean(message)));
    }

    const threadStates = new Map<string, ThreadState>();
    const threadIds = [...new Set(messages.map((message) => message.threadId))];
    for (let start = 0; start < threadIds.length; start += 10) {
      const batch = await Promise.all(threadIds.slice(start, start + 10).map(async (threadId) => {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
        const thread = response.ok ? await response.json() as GmailThread : null;
        const orderedMessages = [...(thread?.messages || [])].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
        const latest = orderedMessages.at(-1);
        return [threadId, { lastMessageSent: Boolean(latest?.labelIds?.includes("SENT")), lastMessageAt: latest?.internalDate ? new Date(Number(latest.internalDate)) : null }] as const;
      }));
      batch.forEach(([threadId, state]) => threadStates.set(threadId, state));
    }

    await Promise.all(messages.map((message) => {
      const subject = header(message, "Subject") || "(No subject)";
      const snippet = message.snippet || "";
      const threadState = threadStates.get(message.threadId);
      const receivedAt = threadState?.lastMessageAt || (message.internalDate ? new Date(Number(message.internalDate)) : null);
      const labelIds = message.labelIds || [];
      const isUnread = labelIds.includes("UNREAD");
      const threadHasReply = threadState?.lastMessageSent || false;
      return prisma.gmailMessage.upsert({
        where: { gmailMessageId: message.id },
        update: { sender: header(message, "From"), subject, snippet, category: category(subject, snippet), labelIds, isUnread, threadHasReply, receivedAt },
        create: { userId: user.id, gmailMessageId: message.id, threadId: message.threadId, sender: header(message, "From"), subject, snippet, category: category(subject, snippet), labelIds, isUnread, threadHasReply, receivedAt },
      });
    }));
    await prisma.gmailConnection.update({ where: { userId: user.id }, data: { lastSyncedAt: new Date() } });
    return NextResponse.json({ scanned: items.length, synced: messages.length, query: JOB_MAIL_QUERY });
  } catch (error) {
    console.error("[gmail] sync failed", error);
    return NextResponse.json({ error: "Gmail sync failed. Reconnect Gmail and try again." }, { status: 502 });
  }
}
