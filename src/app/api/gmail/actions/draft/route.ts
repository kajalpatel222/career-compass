import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateReplyDraft, planEmailAction } from "@/lib/gmail-actions";

const DEMO_EMAIL = "demo@personal-assistant.local";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json() as { gmailMessageId?: string };
  if (!body.gmailMessageId) return NextResponse.json({ error: "A Gmail message is required." }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { gmailConnection: true } });
    if (!user) return NextResponse.json({ error: "No local user exists yet." }, { status: 404 });
    const message = await prisma.gmailMessage.findFirst({ where: { userId: user.id, gmailMessageId: body.gmailMessageId } });
    if (!message) return NextResponse.json({ error: "Job email was not found." }, { status: 404 });
    const plan = planEmailAction(message);
    if (!plan || plan.actionType === "REVIEW") return NextResponse.json({ error: "This message does not need a reply draft." }, { status: 400 });
    if (!user.gmailConnection) return NextResponse.json({ error: "Connect Gmail before generating a draft." }, { status: 404 });
    const draft = await generateReplyDraft({ actionType: plan.actionType, sender: message.sender, subject: message.subject, snippet: message.snippet, signatureName: process.env.CANDIDATE_NAME || "Kajal Patel", signatureEmail: user.gmailConnection.gmailAddress });
    await prisma.emailAction.upsert({
      where: { gmailMessageId: message.gmailMessageId },
      update: { actionType: plan.actionType, priority: plan.priority, priorityReason: plan.priorityReason, draftText: draft.draftText, draftModel: draft.modelUsed, status: "OPEN" },
      create: { userId: user.id, gmailMessageId: message.gmailMessageId, actionType: plan.actionType, priority: plan.priority, priorityReason: plan.priorityReason, draftText: draft.draftText, draftModel: draft.modelUsed },
    });
    return NextResponse.json(draft);
  } catch (error) {
    console.error("[gmail] draft generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Draft could not be generated." }, { status: 502 });
  }
}
