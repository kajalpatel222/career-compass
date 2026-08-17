import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptRefreshToken, exchangeAuthorizationCode, gmailAddress, isGmailConfigured } from "@/lib/gmail";

const DEMO_EMAIL = "demo@personal-assistant.local";
export const runtime = "nodejs";

function redirect(request: NextRequest, gmail: "connected" | "error", reason?: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("gmail", gmail);
  if (reason) url.searchParams.set("gmailReason", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const expectedState = request.cookies.get("gmail_oauth_state")?.value;

  if (error || !state || !code || state !== expectedState) return redirect(request, "error", "Authorization was cancelled or could not be verified.");
  if (!isGmailConfigured()) return redirect(request, "error", "Gmail OAuth is not fully configured.");

  try {
    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) return redirect(request, "error", "Google did not provide a refresh token. Please reconnect Gmail.");
    const address = await gmailAddress(tokens.access_token!);
    const user = await prisma.user.upsert({ where: { email: DEMO_EMAIL }, update: {}, create: { email: DEMO_EMAIL } });
    await prisma.gmailConnection.upsert({
      where: { userId: user.id },
      update: { gmailAddress: address, refreshTokenEncrypted: encryptRefreshToken(tokens.refresh_token), scope: tokens.scope || "https://www.googleapis.com/auth/gmail.readonly" },
      create: { userId: user.id, gmailAddress: address, refreshTokenEncrypted: encryptRefreshToken(tokens.refresh_token), scope: tokens.scope || "https://www.googleapis.com/auth/gmail.readonly" },
    });
    const response = redirect(request, "connected");
    response.cookies.delete("gmail_oauth_state");
    return response;
  } catch (callbackError) {
    console.error("[gmail] OAuth callback failed", callbackError);
    return redirect(request, "error", "Gmail could not be connected. Check the database connection and try again.");
  }
}
