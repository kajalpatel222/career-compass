import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isGmailConfigured } from "@/lib/gmail";

const DEMO_EMAIL = "demo@personal-assistant.local";
export const runtime = "nodejs";

export async function GET() {
  const configured = isGmailConfigured();
  if (!configured) return NextResponse.json({ configured: false, connected: false });
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { gmailConnection: true } });
    const messageCount = user?.gmailConnection ? await prisma.gmailMessage.count({ where: { userId: user.id } }) : 0;
    return NextResponse.json({ configured: true, connected: Boolean(user?.gmailConnection), address: user?.gmailConnection?.gmailAddress || null, lastSyncedAt: user?.gmailConnection?.lastSyncedAt?.toISOString() || null, messageCount });
  } catch {
    return NextResponse.json({ configured: true, connected: false, databaseAvailable: false });
  }
}
