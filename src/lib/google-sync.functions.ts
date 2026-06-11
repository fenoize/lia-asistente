import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SyncResult = { ok: true; google_event_id: string | null } | { ok: false; reason: string };

async function getConnection(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google_calendar")
    .maybeSingle();
  return data ?? null;
}

function meetingToGoogleEvent(m: any, tz: string) {
  const start = new Date(m.datetime);
  const end = new Date(start.getTime() + (m.duration_minutes ?? 60) * 60_000);
  const attendees = Array.isArray(m.attendees)
    ? m.attendees
        .filter((a: any) => a?.email)
        .map((a: any) => ({ email: a.email, displayName: a.name }))
    : undefined;
  const desc = [m.notes, m.link ? `Link: ${m.link}` : null].filter(Boolean).join("\n\n");
  const event: any = {
    summary: m.title,
    description: desc || undefined,
    location: m.location ?? undefined,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    attendees,
  };
  // Request a Meet link only on first creation (no existing google_event_id and no link yet)
  const wantsMeet = m.meeting_type === "video" && !m.link && !m.google_event_id;
  if (wantsMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: m.id,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return event;
}

export const pushMeetingToGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }): Promise<SyncResult> => {
    const conn = await getConnection(context.supabase, context.userId);
    if (!conn) return { ok: false, reason: "not_connected" };

    const { data: meeting } = await context.supabase
      .from("meetings")
      .select("*")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (!meeting) return { ok: false, reason: "meeting_not_found" };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("timezone")
      .eq("id", context.userId)
      .maybeSingle();
    const tz = (profile?.timezone as string | null) ?? "UTC";
    const calendarId = conn.google_calendar_id ?? "primary";

    const { getValidAccessToken, gcalInsertEvent, gcalUpdateEvent } = await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = await getValidAccessToken(supabaseAdmin, conn);
    const event = meetingToGoogleEvent(meeting, tz);

    try {
      if (meeting.google_event_id) {
        const updated = await gcalUpdateEvent(token, calendarId, meeting.google_event_id, event);
        if (updated) {
          const patch: any = {
            google_etag: updated.etag ?? null,
            last_synced_at: new Date().toISOString(),
            sync_source: "app",
          };
          if (updated.hangoutLink && !meeting.link) patch.link = updated.hangoutLink;
          await context.supabase.from("meetings").update(patch).eq("id", meeting.id);
          return { ok: true, google_event_id: meeting.google_event_id };
        }
        // fall through to insert if not found
      }
      const created = await gcalInsertEvent(token, calendarId, event);
      const patch: any = {
        google_event_id: created.id,
        google_etag: created.etag ?? null,
        last_synced_at: new Date().toISOString(),
        sync_source: "app",
      };
      if (created.hangoutLink) patch.link = created.hangoutLink;
      await context.supabase.from("meetings").update(patch).eq("id", meeting.id);
      return { ok: true, google_event_id: created.id };
    } catch (err: any) {
      console.error("[pushMeetingToGoogle]", err?.message ?? err);
      return { ok: false, reason: err?.message ?? "unknown" };
    }
  });

export const deleteMeetingFromGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { googleEventId: string }) => data)
  .handler(async ({ data, context }): Promise<SyncResult> => {
    const conn = await getConnection(context.supabase, context.userId);
    if (!conn) return { ok: false, reason: "not_connected" };
    const calendarId = conn.google_calendar_id ?? "primary";
    const { getValidAccessToken, gcalDeleteEvent } = await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const token = await getValidAccessToken(supabaseAdmin, conn);
      await gcalDeleteEvent(token, calendarId, data.googleEventId);
      return { ok: true, google_event_id: null };
    } catch (err: any) {
      console.error("[deleteMeetingFromGoogle]", err?.message ?? err);
      return { ok: false, reason: err?.message ?? "unknown" };
    }
  });

export const pullGoogleEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const conn = await getConnection(context.supabase, context.userId);
    if (!conn) return { ok: false as const, reason: "not_connected", count: 0 };

    const calendarId = conn.google_calendar_id ?? "primary";
    const { getValidAccessToken, gcalListEvents } = await import("@/lib/google-calendar.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = await getValidAccessToken(supabaseAdmin, conn);

    // Initial range: 30 days back, 90 days forward
    const now = Date.now();
    const timeMin = new Date(now - 30 * 86_400_000).toISOString();
    const timeMax = new Date(now + 90 * 86_400_000).toISOString();

    let result = await gcalListEvents(token, calendarId, {
      syncToken: conn.sync_token ?? undefined,
      timeMin,
      timeMax,
    });
    if (result.invalidated) {
      // fresh full sync
      result = await gcalListEvents(token, calendarId, { timeMin, timeMax });
    }

    let upserts = 0;
    let deletes = 0;
    for (const ev of result.events) {
      if (ev.status === "cancelled") {
        const { error } = await context.supabase
          .from("meetings")
          .delete()
          .eq("user_id", context.userId)
          .eq("google_event_id", ev.id);
        if (!error) deletes++;
        continue;
      }
      if (!ev.start?.dateTime) continue; // skip all-day events
      const start = ev.start.dateTime;
      const end = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : null;
      const duration = end ? Math.max(15, Math.round((end - new Date(start).getTime()) / 60_000)) : 60;

      const { data: existing } = await context.supabase
        .from("meetings")
        .select("id, updated_at")
        .eq("user_id", context.userId)
        .eq("google_event_id", ev.id)
        .maybeSingle();

      const payload: any = {
        title: ev.summary ?? "(Sin título)",
        datetime: new Date(start).toISOString(),
        duration_minutes: duration,
        location: ev.location ?? null,
        notes: ev.description ?? null,
        google_event_id: ev.id,
        google_etag: ev.etag ?? null,
        last_synced_at: new Date().toISOString(),
        sync_source: "google",
        meeting_type: ev.hangoutLink || ev.conferenceData ? "video" : "in_person",
        link: ev.hangoutLink ?? null,
      };

      if (existing) {
        // Conflict: if local meeting updated more recently than Google's event update, skip
        const googleUpdated = ev.updated ? new Date(ev.updated).getTime() : 0;
        const localUpdated = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        if (localUpdated > googleUpdated) continue;
        await context.supabase.from("meetings").update(payload).eq("id", existing.id);
      } else {
        await context.supabase
          .from("meetings")
          .insert({ ...payload, user_id: context.userId, status: "scheduled" });
      }
      upserts++;
    }

    if (result.nextSyncToken) {
      await context.supabase
        .from("user_integrations")
        .update({ sync_token: result.nextSyncToken })
        .eq("id", conn.id);
    }

    return { ok: true as const, upserts, deletes, count: upserts + deletes };
  });
