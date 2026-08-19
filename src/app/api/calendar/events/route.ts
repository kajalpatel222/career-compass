import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CALENDAR_SCOPE, decryptRefreshToken, hasGoogleScope, refreshAccessToken } from "@/lib/gmail";

const DEMO_EMAIL = "demo@personal-assistant.local";
const MAX_RANGE_DAYS = 62;

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

type CalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  error?: { message?: string };
};

function validDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, include: { gmailConnection: true } });
    const connection = user?.gmailConnection;
    if (!connection) return NextResponse.json({ events: [], connected: false, reconnectRequired: true }, { status: 401 });
    if (!hasGoogleScope(connection.scope, CALENDAR_SCOPE)) {
      return NextResponse.json({ events: [], connected: true, reconnectRequired: true, address: connection.gmailAddress }, { status: 403 });
    }

    const now = new Date();
    const fallbackMin = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fallbackMax = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const requestedMin = validDate(request.nextUrl.searchParams.get("timeMin")) || fallbackMin;
    const requestedMax = validDate(request.nextUrl.searchParams.get("timeMax")) || fallbackMax;
    const maximumEnd = new Date(requestedMin.getTime() + MAX_RANGE_DAYS * 86_400_000);
    const timeMax = requestedMax > maximumEnd ? maximumEnd : requestedMax;
    if (timeMax <= requestedMin) return NextResponse.json({ error: "Choose a valid calendar range." }, { status: 400 });

    const accessToken = (await refreshAccessToken(decryptRefreshToken(connection.refreshTokenEncrypted))).access_token!;
    const parameters = new URLSearchParams({
      timeMin: requestedMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${parameters}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({} as CalendarEventsResponse)) as CalendarEventsResponse;
    if (!response.ok) throw new Error(payload.error?.message || `Google Calendar returned HTTP ${response.status}.`);

    const events = (payload.items || [])
      .filter((event) => event.id && event.status !== "cancelled" && (event.start?.dateTime || event.start?.date))
      .map((event) => ({
        id: event.id!,
        title: event.summary?.trim() || "Busy",
        details: event.description?.trim().slice(0, 500) || null,
        htmlLink: event.htmlLink || null,
        allDay: Boolean(event.start?.date && !event.start.dateTime),
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
      }));

    return NextResponse.json({ events, connected: true, reconnectRequired: false, address: connection.gmailAddress });
  } catch (error) {
    console.error("[calendar] events could not be loaded", error);
    return NextResponse.json({ error: "Google Calendar could not be loaded. Reconnect Google and try again." }, { status: 502 });
  }
}
