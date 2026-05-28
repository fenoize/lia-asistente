// Edge Function: send-notifications
// Runs every ~10 minutes via pg_cron.
// Sends OneSignal push notifications for:
//   - tasks due today (not completed)
//   - reminders within the next 15 minutes
//   - meetings starting within the next 30 minutes
// Deduplicates via the notification_log table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ONESIGNAL_APP_ID = "9de4397a-f173-4215-a0e7-f89f49202f72";

type Job = {
  userId: string;
  entityType: "task" | "reminder" | "meeting";
  entityId: string;
  scheduledFor: string | null;
  title: string;
  body: string;
};

async function sendOneSignal(playerId: string, title: string, body: string, restKey: string): Promise<string | null> {
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Basic ${restKey}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [playerId],
      headings: { en: title, es: title },
      contents: { en: body, es: body },
    }),
  });
  if (!res.ok) {
    console.error("OneSignal error", res.status, await res.text());
    return null;
  }
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!restKey || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * 60 * 1000);
    const in30 = new Date(now.getTime() + 30 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    const jobs: Job[] = [];

    // Tasks due today, not done
    const { data: tasks } = await sb
      .from("tasks")
      .select("id, user_id, title, due_date, status")
      .neq("status", "completed")
      .gte("due_date", todayStart.toISOString())
      .lt("due_date", tomorrowStart.toISOString());

    for (const t of tasks ?? []) {
      jobs.push({
        userId: t.user_id,
        entityType: "task",
        entityId: t.id,
        scheduledFor: t.due_date,
        title: "Tarea para hoy",
        body: t.title,
      });
    }

    // Reminders in next 15 min
    const { data: reminders } = await sb
      .from("reminders")
      .select("id, user_id, title, datetime, done")
      .eq("done", false)
      .gte("datetime", now.toISOString())
      .lte("datetime", in15.toISOString());

    for (const r of reminders ?? []) {
      jobs.push({
        userId: r.user_id,
        entityType: "reminder",
        entityId: r.id,
        scheduledFor: r.datetime,
        title: "Recordatorio",
        body: r.title,
      });
    }

    // Meetings in next 30 min
    const { data: meetings } = await sb
      .from("meetings")
      .select("id, user_id, title, datetime")
      .gte("datetime", now.toISOString())
      .lte("datetime", in30.toISOString());

    for (const m of meetings ?? []) {
      jobs.push({
        userId: m.user_id,
        entityType: "meeting",
        entityId: m.id,
        scheduledFor: m.datetime,
        title: "Reunión pronto",
        body: m.title,
      });
    }

    if (jobs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch player IDs for the involved users
    const userIds = Array.from(new Set(jobs.map((j) => j.userId)));
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, onesignal_player_id")
      .in("id", userIds);

    const playerByUser = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.onesignal_player_id) playerByUser.set(p.id, p.onesignal_player_id);
    }

    let sent = 0;
    let skipped = 0;

    for (const job of jobs) {
      const player = playerByUser.get(job.userId);
      if (!player) {
        skipped++;
        continue;
      }

      // Dedup: try to insert log row first
      const { error: logErr } = await sb.from("notification_log").insert({
        user_id: job.userId,
        entity_type: job.entityType,
        entity_id: job.entityId,
        scheduled_for: job.scheduledFor,
      });
      if (logErr) {
        // Unique violation = already sent
        skipped++;
        continue;
      }

      const notifId = await sendOneSignal(player, job.title, job.body, restKey);
      if (notifId) {
        await sb
          .from("notification_log")
          .update({ onesignal_notification_id: notifId })
          .eq("user_id", job.userId)
          .eq("entity_type", job.entityType)
          .eq("entity_id", job.entityId)
          .eq("scheduled_for", job.scheduledFor);
      }
      sent++;
    }

    return new Response(JSON.stringify({ sent, skipped, total: jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-notifications error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
