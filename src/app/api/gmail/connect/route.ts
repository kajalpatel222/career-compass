import { NextRequest, NextResponse } from "next/server";
import { createGmailAuthorizationUrl, createOAuthState, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isGmailConfigured()) return NextResponse.json({ error: "Gmail OAuth is not fully configured." }, { status: 503 });

  const state = createOAuthState();
  const requestedReturnTo = request.nextUrl.searchParams.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/";
  const response = NextResponse.redirect(createGmailAuthorizationUrl(state));
  response.cookies.set("gmail_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60, path: "/" });
  response.cookies.set("google_oauth_return_to", returnTo, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 10 * 60, path: "/" });
  return response;
}
