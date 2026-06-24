// Server-only helpers for Google Calendar OAuth + sync.
// Never import directly from client/route files — only from .functions.ts handlers
// or api/public route handlers (with dynamic import).

import { createHmac, timingSafeEqual } from "crypto";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
].join(" ");

export const GOOGLE_OAUTH_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_CAL_BASE = "https://www.googleapis.com/calendar/v3";

// ---------- State signing (HMAC) ----------
function stateSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_JWT_SECRET ?? "lia-state-fallback";
}

export function signState(payload: Record<string, unknown>) {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const body = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): Record<string, any> | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof data.ts !== "number" || Date.now() - data.ts > 15 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

// ---------- Token helpers ----------
export type GoogleConnection = {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string | null;
  google_calendar_id: string | null;
  sync_token: string | null;
};

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  }>;
}

export class GoogleReconnectRequiredError extends Error {
  constructor(message = "Tu conexión con Google expiró. Vuelve a conectar tu cuenta.") {
    super(message);
    this.name = "GoogleReconnectRequiredError";
  }
}

export async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && /invalid_grant/i.test(body)) {
      throw new GoogleReconnectRequiredError();
    }
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number; scope: string; token_type: string }>;
}

// Returns a valid access token; refreshes if expired. Updates DB if refreshed.
export async function getValidAccessToken(
  supabaseAdmin: any,
  conn: GoogleConnection,
): Promise<string> {
  const now = Date.now();
  const exp = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (conn.access_token && exp - 60_000 > now) return conn.access_token;
  if (!conn.refresh_token) {
    await supabaseAdmin.from("user_integrations").delete().eq("id", conn.id);
    throw new GoogleReconnectRequiredError();
  }
  try {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("user_integrations")
      .update({ access_token: refreshed.access_token, expires_at: newExpiresAt })
      .eq("id", conn.id);
    return refreshed.access_token;
  } catch (err) {
    if (err instanceof GoogleReconnectRequiredError) {
      // Remove the dead integration so the UI prompts a fresh OAuth flow.
      await supabaseAdmin.from("user_integrations").delete().eq("id", conn.id);
    }
    throw err;
  }
}

// ---------- Google Calendar API ----------
export type GoogleEventInput = {
  summary?: string;
  description?: string | null;
  location?: string | null;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string; displayName?: string }[];
  conferenceData?: {
    createRequest?: {
      requestId: string;
      conferenceSolutionKey?: { type: string };
    };
  };
};

async function gcalFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GOOGLE_CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export async function gcalInsertEvent(accessToken: string, calendarId: string, event: GoogleEventInput) {
  const qs = event.conferenceData ? "?conferenceDataVersion=1" : "";
  const res = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events${qs}`, {
    method: "POST",
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`gcal insert failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function gcalUpdateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GoogleEventInput,
) {
  const qs = event.conferenceData ? "?conferenceDataVersion=1" : "";
  const res = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}${qs}`, {
    method: "PATCH",
    body: JSON.stringify(event),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gcal update failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function gcalDeleteEvent(accessToken: string, calendarId: string, eventId: string) {
  const res = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  });
  // 404/410 → already gone, ignore
  if (res.status === 404 || res.status === 410) return;
  if (!res.ok) throw new Error(`gcal delete failed: ${res.status} ${await res.text()}`);
}

export async function gcalListEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string; timeMin?: string; timeMax?: string },
) {
  const params = new URLSearchParams();
  if (opts.syncToken) params.set("syncToken", opts.syncToken);
  else {
    params.set("singleEvents", "true");
    if (opts.timeMin) params.set("timeMin", opts.timeMin);
    if (opts.timeMax) params.set("timeMax", opts.timeMax);
  }
  params.set("maxResults", "250");

  const all: any[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;
  do {
    if (nextPageToken) params.set("pageToken", nextPageToken);
    const res = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
    if (res.status === 410) {
      // sync token invalidated → caller should do a full sync
      return { events: [], nextSyncToken: undefined, invalidated: true as const };
    }
    if (!res.ok) throw new Error(`gcal list failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    if (Array.isArray(data.items)) all.push(...data.items);
    nextPageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
  } while (nextPageToken);

  return { events: all, nextSyncToken, invalidated: false as const };
}
