// Server-side orchestration for the Follow-Up Engine.
// Reads tasks + follow-up memory from the database, runs the pure engine, and
// persists the resulting interventions into the existing notification_log
// (so they show up in the in-app notification centre) plus task_followups
// (cooldown / escalation memory).
//
// Deliberately reuses the existing notification infrastructure instead of
// creating a parallel one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePrefs } from "./config";
import { selectDailyInterventions } from "./engine";
import type { FollowUpMemory, FollowUpTask } from "./types";

export type RunResult = {
  userId: string;
  evaluated: number;
  created: number;
  skipped: number;
  grouped: boolean;
};

const TASK_FIELDS =
  "id, user_id, title, status, priority, due_date, start_date, created_at, updated_at, project_id, project, discarded_at";

const ONESIGNAL_APP_ID = "9de4397a-f173-4215-a0e7-f89f49202f72";
const APP_URL = "https://lia-asistente.lovable.app";

/** Hour of day (in the user's timezone) outside which we never push. */
const PUSH_WINDOW = { start: 8, end: 21 };

function localHour(now: Date, timezone?: string | null): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone || "UTC",
      }).format(now),
    );
  } catch {
    return now.getUTCHours();
  }
}

async function sendPush(
  playerId: string,
  title: string,
  body: string,
  url?: string,
): Promise<string | null> {
  const restKey = process.env["ONESIGNAL_REST_API_KEY"];
  if (!restKey) {
    console.warn("[followup] ONESIGNAL_REST_API_KEY missing, skipping push");
    return null;
  }
  try {
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
        ...(url ? { url } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[followup] OneSignal error", res.status, await res.text());
      return null;
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return data?.id ?? null;
  } catch (e) {
    console.error("[followup] OneSignal request failed", e);
    return null;
  }
}

export async function runFollowUpsForUser(
  sb: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<RunResult> {
  const [{ data: profile }, { data: taskRows }, { data: memoryRows }, { data: projectRows }] =
    await Promise.all([
      sb
        .from("profiles")
        .select("followup_prefs, onesignal_player_id, timezone")
        .eq("id", userId)
        .maybeSingle(),
      sb
        .from("tasks")
        .select(TASK_FIELDS)
        .eq("user_id", userId)
        .neq("status", "listo")
        .is("discarded_at", null)
        .limit(200),
      sb.from("task_followups").select("*").eq("user_id", userId),
      sb.from("projects").select("id, name").eq("user_id", userId),
    ]);

  const prof = profile as {
    followup_prefs?: unknown;
    onesignal_player_id?: string | null;
    timezone?: string | null;
  } | null;
  const prefs = normalizePrefs(prof?.followup_prefs);
  const playerId = prof?.onesignal_player_id ?? null;
  const hour = localHour(now, prof?.timezone);
  const canPush = playerId && hour >= PUSH_WINDOW.start && hour < PUSH_WINDOW.end;
  const tasks = (taskRows ?? []) as unknown as FollowUpTask[];
  const memories = new Map<string, FollowUpMemory>(
    ((memoryRows ?? []) as unknown as FollowUpMemory[]).map((m) => [m.task_id, m]),
  );
  const projectNames = new Map<string, string>(
    ((projectRows ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]),
  );

  // Interventions already delivered today count against the attention budget.
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await sb
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entity_type", "task")
    .gte("sent_at", dayStart.toISOString());

  const selection = selectDailyInterventions({
    tasks,
    memories,
    projectNames,
    prefs,
    sentToday: sentToday ?? 0,
    now,
  });

  if (!prefs.enabled) {
    return { userId, evaluated: tasks.length, created: 0, skipped: tasks.length, grouped: false };
  }

  let created = 0;
  let skipped = 0;

  const deliver = async (
    entityId: string,
    anchor: string,
    title: string,
    body: string,
    taskIds: string[],
    meta: { state: string; intent: string; message: string },
  ) => {
    const scheduledFor = anchorToTimestamp(anchor, now);
    const { error } = await sb.from("notification_log").insert({
      user_id: userId,
      entity_type: "task",
      entity_id: entityId,
      scheduled_for: scheduledFor,
      title,
      body,
    });
    if (error) {
      skipped++;
      return;
    }
    created++;

    // Actually deliver the push — otherwise the intervention only ever shows
    // up in the in-app notification centre when the user opens the app.
    if (canPush && playerId) {
      const notifId = await sendPush(playerId, title, body, `${APP_URL}/tasks?task=${entityId}`);
      if (notifId) {
        await sb
          .from("notification_log")
          .update({ onesignal_notification_id: notifId })
          .eq("user_id", userId)
          .eq("entity_type", "task")
          .eq("entity_id", entityId)
          .eq("scheduled_for", scheduledFor);
      }
    }
    for (const taskId of taskIds) {
      const prev = memories.get(taskId);
      await sb.from("task_followups").upsert(
        {
          user_id: userId,
          task_id: taskId,
          notification_count: (prev?.notification_count ?? 0) + 1,
          last_notification_at: now.toISOString(),
          last_state: meta.state,
          last_intent: meta.intent,
          last_message: meta.message,
        },
        { onConflict: "task_id" },
      );
    }
  };

  if (selection.grouped) {
    const g = selection.grouped;
    await deliver(g.primary.task.id, g.anchor, g.title, g.message, g.taskIds, {
      state: g.primary.evaluation.task_state,
      intent: g.primary.evaluation.notification_intent,
      message: g.message,
    });
  } else {
    for (const item of selection.interventions) {
      await deliver(item.task.id, item.anchor, item.title, item.message, [item.task.id], {
        state: item.evaluation.task_state,
        intent: item.evaluation.notification_intent,
        message: item.message,
      });
    }
  }

  return {
    userId,
    evaluated: tasks.length,
    created,
    skipped,
    grouped: Boolean(selection.grouped),
  };
}

export async function runFollowUpsForAllUsers(sb: SupabaseClient, now = new Date()): Promise<RunResult[]> {
  const { data: profiles } = await sb.from("profiles").select("id, followup_prefs").limit(500);
  const results: RunResult[] = [];
  for (const p of (profiles ?? []) as Array<{ id: string; followup_prefs: unknown }>) {
    if (!normalizePrefs(p.followup_prefs).enabled) continue;
    try {
      results.push(await runFollowUpsForUser(sb, p.id, now));
    } catch (e) {
      console.error("follow-up run failed", p.id, e);
    }
  }
  return results;
}

/**
 * notification_log dedupes on (user, type, entity, scheduled_for), so the
 * anchor is folded into a deterministic timestamp: same anchor → same slot →
 * no duplicate notification for the same task/intent/day.
 */
function anchorToTimestamp(anchor: string, now: Date): string {
  let h = 0;
  for (let i = 0; i < anchor.length; i++) h = (h * 31 + anchor.charCodeAt(i)) >>> 0;
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return new Date(day.getTime() + (h % 86_399) * 1000).toISOString();
}
