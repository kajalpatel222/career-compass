import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planEmailAction } from "@/lib/gmail-actions";

const DEMO_EMAIL = "demo@personal-assistant.local";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) return NextResponse.json({ actions: [] });
    const messages = await prisma.gmailMessage.findMany({ where: { userId: user.id }, include: { action: true }, orderBy: { receivedAt: "desc" } });
    const actions = messages
      .map((message) => {
        const plan = planEmailAction(message);
        if (!plan || message.action?.status === "DONE") return null;
        return {
          id: message.id,
          gmailMessageId: message.gmailMessageId,
          threadId: message.threadId,
          sender: message.sender,
          subject: message.subject,
          snippet: message.snippet,
          category: message.category,
          isUnread: message.isUnread,
          receivedAt: message.receivedAt,
          ...plan,
          draftText: message.action?.draftText || null,
          draftModel: message.action?.draftModel || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.priority - a.priority || Number(b.isUnread) - Number(a.isUnread));
    return NextResponse.json({ actions });
  } catch (error) {
    console.error("[gmail] action queue read failed", error);
    return NextResponse.json({ error: "Action queue could not be loaded." }, { status: 502 });
  }
}
