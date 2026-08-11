// Task Follow-Up Engine — decision core.
//
// Pure functions only: no DB, no network, no framework. This makes the engine
// usable from the browser (dashboard "needs attention" view) and from the
// server (scheduled job) with identical behaviour, and easy to extend to other
// entities later (projects, payments, meetings...).
//
// Pipeline:
//   deriveTaskState → evaluateTaskForFollowUp → selectDailyInterventions

import {
  AGE_BUCKETS,
  COOLDOWN_BY_ATTEMPT_HOURS,
  COOLDOWN_MAX_HOURS,
  DAY_MS,
  DEADLINE_WINDOWS,
  DONE_STATUSES,
  FREQUENCY_PROFILES,
  GROUPING_MIN,
  HOUR_MS,
  PRIORITY_SCORE,
  QUIET_AFTER_ACTIVITY_HOURS,
  QUIET_AFTER_CREATION_HOURS,
  STATE_SCORE,
  priorityBand,
} from "./config";
import { generateGroupedFollowUp, generateTaskFollowUp } from "./messages";
import type {
  AgeBucket,
  Evaluation,
  FollowUpMemory,
  FollowUpPrefs,
  FollowUpTask,
  GroupedIntervention,
  Intervention,
  NotificationIntent,
  SuggestedAction,
  TaskState,
} from "./types";

export type EvaluateOptions = {
  memory?: FollowUpMemory | null;
  prefs: FollowUpPrefs;
  now?: Date;
};

function hoursSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(iso).getTime()) / HOUR_MS;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

export function ageBucketFor(task: FollowUpTask, now = new Date()): AgeBucket {
  const anchor = task.updated_at && task.created_at
    ? new Date(Math.max(new Date(task.created_at).getTime(), 0))
    : new Date(task.created_at ?? now.toISOString());
  const days = daysBetween(anchor, now);
  return (AGE_BUCKETS.find((b) => days >= b.minDays)?.bucket ?? "new_undated") as AgeBucket;
}

/** Derives the logical state of a task. Does not replace task.status. */
export function deriveTaskState(
  task: FollowUpTask,
  memory?: FollowUpMemory | null,
  now = new Date(),
): TaskState {
  if (task.discarded_at) return "discarded";
  if (DONE_STATUSES.has((task.status ?? "").toLowerCase())) return "completed";
  if (memory?.blocked) return "blocked";

  if (!task.due_date) {
    const bucket = ageBucketFor(task, now);
    return bucket === "stale" || bucket === "very_stale" ? "stale" : "undated";
  }

  const due = new Date(task.due_date);
  const hoursUntil = (due.getTime() - now.getTime()) / HOUR_MS;
  const sameDay = due.toDateString() === now.toDateString();

  if (hoursUntil < 0 && !sameDay) return "overdue";
  if (sameDay) return "due_today";
  if (hoursUntil <= DEADLINE_WINDOWS.dueSoonFromHours) return "due_today";
  if (hoursUntil <= DEADLINE_WINDOWS.upcomingBeyondHours) return "due_soon";
  return "upcoming";
}

const BASE_INTENT: Record<TaskState, NotificationIntent> = {
  completed: "anticipate",
  discarded: "anticipate",
  upcoming: "anticipate",
  due_soon: "prepare",
  due_today: "activate",
  overdue: "resolve",
  undated: "schedule",
  stale: "schedule",
  blocked: "unblock",
};

/** Escalation: as interventions are ignored, the intent changes strategy. */
function escalateIntent(base: NotificationIntent, state: TaskState, attempt: number): NotificationIntent {
  if (attempt <= 0) return base;
  if (state === "undated" || state === "stale") {
    if (attempt === 1) return "schedule";
    if (attempt === 2) return "clarify";
    return "discard";
  }
  if (state === "overdue") {
    if (attempt === 1) return "resolve";
    return "clarify";
  }
  return base;
}

const ACTIONS_BY_INTENT: Record<NotificationIntent, SuggestedAction[]> = {
  anticipate: ["open", "start", "snooze"],
  prepare: ["open", "start", "today", "snooze"],
  activate: ["complete", "start", "open", "tomorrow"],
  resolve: ["complete", "today", "tomorrow", "open"],
  schedule: ["today", "tomorrow", "this_week", "pick_date", "open"],
  clarify: ["this_week", "pick_date", "unblock", "discard"],
  unblock: ["unblock", "open", "snooze"],
  discard: ["this_week", "pick_date", "discard"],
};

function cooldownHours(attempt: number, multiplier: number): number {
  const base =
    COOLDOWN_BY_ATTEMPT_HOURS[Math.min(attempt, COOLDOWN_BY_ATTEMPT_HOURS.length - 1)] ??
    COOLDOWN_MAX_HOURS;
  return Math.min(base * multiplier, COOLDOWN_MAX_HOURS);
}

/**
 * Core decision function. Returns why (or why not) LIA should intervene.
 * Never throws: an un-notifiable task simply gets should_notify: false.
 */
export function evaluateTaskForFollowUp(task: FollowUpTask, opts: EvaluateOptions): Evaluation {
  const now = opts.now ?? new Date();
  const { prefs } = opts;
  const memory = opts.memory ?? null;
  const profile = FREQUENCY_PROFILES[prefs.frequency];

  const state = deriveTaskState(task, memory, now);
  const bucket = task.due_date ? null : ageBucketFor(task, now);
  const attempt = memory?.notification_count ?? 0;
  const intent = escalateIntent(BASE_INTENT[state], state, attempt);

  const priorityKey = (task.priority ?? "medium").toLowerCase();
  let score = (STATE_SCORE[state] ?? 0) + (PRIORITY_SCORE[priorityKey] ?? 0);

  // Aging amplifies undated tasks; days overdue amplify overdue ones.
  if (state === "overdue") {
    const daysLate = Math.floor(daysBetween(new Date(task.due_date!), now));
    score += Math.min(daysLate * 3, 25);
  }
  if (state === "stale" && bucket === "very_stale") score += 15;

  // Repeated ignores lower relevance so fresh items win the daily budget.
  score -= Math.min(attempt * 8, 24);

  const cooldownH = cooldownHours(attempt, profile.cooldownMultiplier);
  const cooldownUntil = memory?.last_notification_at
    ? new Date(new Date(memory.last_notification_at).getTime() + cooldownH * HOUR_MS).toISOString()
    : null;

  const base: Omit<Evaluation, "should_notify" | "reason"> = {
    task_id: task.id,
    task_state: state,
    age_bucket: bucket,
    notification_intent: intent,
    priority: priorityBand(score),
    score,
    cooldown_until: cooldownUntil,
    suggested_actions: ACTIONS_BY_INTENT[intent],
  };

  const no = (reason: string): Evaluation => ({ ...base, should_notify: false, reason });

  if (!prefs.enabled) return no("Seguimiento proactivo desactivado");
  if (state === "completed") return no("Tarea completada");
  if (state === "discarded") return no("Tarea descartada");
  if (memory?.dismissed) return no("El usuario pidió no insistir con esta tarea");
  if (memory?.snoozed_until && new Date(memory.snoozed_until) > now) return no("Pospuesta por el usuario");
  if (!prefs.undated && (state === "undated" || state === "stale")) return no("Sugerencias sin fecha desactivadas");
  if (!prefs.stale_cleanup && intent === "discard") return no("Limpieza de tareas antiguas desactivada");
  if (hoursSince(task.created_at, now) < QUIET_AFTER_CREATION_HOURS) return no("Tarea recién creada");
  if (hoursSince(task.updated_at ?? null, now) < QUIET_AFTER_ACTIVITY_HOURS)
    return no("El usuario interactuó con la tarea hace poco");
  if (cooldownUntil && new Date(cooldownUntil) > now) return no("En cooldown desde la última intervención");
  if (state === "upcoming" && priorityKey !== "urgent" && priorityKey !== "high")
    return no("Todavía falta bastante para el vencimiento");
  if (state === "undated" && bucket === "new_undated") return no("Sin fecha, pero todavía es reciente");
  if (score < profile.minScore) return no("Relevancia bajo el umbral de la frecuencia elegida");

  return {
    ...base,
    should_notify: true,
    reason: reasonFor(state, intent, attempt),
  };
}

function reasonFor(state: TaskState, intent: NotificationIntent, attempt: number): string {
  const map: Record<TaskState, string> = {
    overdue: "La tarea pasó su fecha de vencimiento",
    due_today: "La tarea vence hoy",
    due_soon: "La tarea vence dentro de 72 horas",
    upcoming: "Tarea próxima de alta prioridad",
    undated: "Tarea pendiente sin fecha",
    stale: "Tarea sin fecha con demasiada antigüedad",
    blocked: "Tarea marcada como bloqueada",
    completed: "",
    discarded: "",
  };
  const suffix = attempt > 0 ? ` (intervención #${attempt + 1}, enfoque: ${intent})` : "";
  return `${map[state]}${suffix}`;
}

export type SelectionInput = {
  tasks: FollowUpTask[];
  memories: Map<string, FollowUpMemory>;
  projectNames: Map<string, string>;
  prefs: FollowUpPrefs;
  /** Interventions already sent today (counts against the budget). */
  sentToday?: number;
  now?: Date;
};

export type Selection = {
  evaluations: Evaluation[];
  interventions: Intervention[];
  grouped: GroupedIntervention | null;
  budget: number;
};

/**
 * Evaluates every task, then applies the daily attention budget and grouping.
 * Highest score wins; several tasks of the same project collapse into one
 * grouped intervention instead of spamming.
 */
export function selectDailyInterventions(input: SelectionInput): Selection {
  const now = input.now ?? new Date();
  const { prefs } = input;
  const budget = Math.max(
    1,
    prefs.daily_budget + FREQUENCY_PROFILES[prefs.frequency].budgetDelta - (input.sentToday ?? 0),
  );

  const evaluations = input.tasks.map((task) =>
    evaluateTaskForFollowUp(task, { memory: input.memories.get(task.id) ?? null, prefs, now }),
  );

  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const candidates = evaluations
    .filter((e) => e.should_notify)
    .sort((a, b) => b.score - a.score);

  const build = (evaluation: Evaluation): Intervention => {
    const task = byId.get(evaluation.task_id)!;
    const projectName = task.project_id ? input.projectNames.get(task.project_id) ?? null : task.project ?? null;
    const attempt = input.memories.get(task.id)?.notification_count ?? 0;
    const { title, message } = generateTaskFollowUp(task, evaluation, { projectName, attempt, now });
    return {
      evaluation,
      task,
      projectName,
      title,
      message,
      anchor: anchorFor(task.id, evaluation, attempt, now),
    };
  };

  // Grouping: if several candidates share a project, send one grouped message.
  const byProject = new Map<string, Evaluation[]>();
  for (const e of candidates) {
    const task = byId.get(e.task_id)!;
    const key = task.project_id ?? "__none__";
    byProject.set(key, [...(byProject.get(key) ?? []), e]);
  }

  let grouped: GroupedIntervention | null = null;
  const groupEntry = [...byProject.entries()].find(([, list]) => list.length >= GROUPING_MIN);
  if (groupEntry || candidates.length >= GROUPING_MIN + 1) {
    const list = groupEntry ? groupEntry[1] : candidates.slice(0, 4);
    const items = list.map((e) => {
      const task = byId.get(e.task_id)!;
      return {
        task,
        projectName: task.project_id ? input.projectNames.get(task.project_id) ?? null : null,
        state: e.task_state,
      };
    });
    const { title, message } = generateGroupedFollowUp(items);
    const primary = build(list[0]!);
    grouped = {
      kind: "grouped",
      taskIds: list.map((e) => e.task_id),
      projectName: items[0]?.projectName ?? null,
      title,
      message,
      anchor: `grouped:${dayKey(now)}`,
      primary,
    };
  }

  const interventions = grouped
    ? [] // the grouped message replaces the individual ones for those tasks
    : candidates.slice(0, budget).map(build);

  return { evaluations, interventions, grouped, budget };
}

function dayKey(now: Date) {
  return now.toISOString().slice(0, 10);
}

function anchorFor(taskId: string, evaluation: Evaluation, attempt: number, now: Date): string {
  return `${dayKey(now)}:${evaluation.notification_intent}:${attempt}:${taskId.slice(0, 8)}`;
}

/** Dashboard summary: how many tasks sit in each state right now. */
export function summarizeAttention(
  tasks: FollowUpTask[],
  memories: Map<string, FollowUpMemory> = new Map(),
  now = new Date(),
) {
  const counts: Record<TaskState, number> = {
    completed: 0,
    discarded: 0,
    upcoming: 0,
    due_soon: 0,
    due_today: 0,
    overdue: 0,
    undated: 0,
    stale: 0,
    blocked: 0,
  };
  for (const t of tasks) counts[deriveTaskState(t, memories.get(t.id) ?? null, now)]++;
  return counts;
}
