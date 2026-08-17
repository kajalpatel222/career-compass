import { NextResponse } from "next/server";
import { createGmailAuthorizationUrl, createOAuthState, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET() {
  if (!isGmailConfigured()) return NextResponse.json({ error: "Gmail OAuth is not fully configured." }, { status: 503 });

  const state = createOAuthState();
  const response = NextResponse.redirect(createGmailAuthorizationUrl(state));
  response.cookies.set("gmail_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60, path: "/" });
  return response;
}
