import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REDIRECT_URI" | "GMAIL_TOKEN_ENCRYPTION_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function encryptionKey() {
  const decoded = Buffer.from(requiredEnv("GMAIL_TOKEN_ENCRYPTION_KEY"), "base64");
  if (decoded.length !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return decoded;
}

export function isGmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_REDIRECT_URI?.trim() && process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim());
}

export function createGmailAuthorizationUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", requiredEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requiredEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

async function tokenRequest(parameters: URLSearchParams) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: parameters,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({} as GoogleTokenResponse)) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || "Google did not return an access token.");
  return payload;
}

export async function exchangeAuthorizationCode(code: string) {
  const parameters = new URLSearchParams({
    code,
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requiredEnv("GOOGLE_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  return tokenRequest(parameters);
}

export async function refreshAccessToken(refreshToken: string) {
  const parameters = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  return tokenRequest(parameters);
}

export async function gmailAddress(accessToken: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({} as { emailAddress?: string; error?: { message?: string } })) as { emailAddress?: string; error?: { message?: string } };
  if (!response.ok || !payload.emailAddress) throw new Error(payload.error?.message || `Gmail could not confirm the connected address (HTTP ${response.status}).`);
  return payload.emailAddress;
}

export function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptRefreshToken(value: string) {
  const [ivValue, authTagValue, encryptedValue] = value.split(".");
  if (!ivValue || !authTagValue || !encryptedValue) throw new Error("Stored Gmail token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}
