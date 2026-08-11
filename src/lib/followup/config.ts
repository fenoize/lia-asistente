// Central, tunable configuration for the Follow-Up Engine.
// Nothing in engine.ts hardcodes thresholds: change them here.

import type { AgeBucket, FollowUpPrefs, InterventionPriority } from "./types";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Deadline windows, in hours before the due date. */
export const DEADLINE_WINDOWS = {
  /** More than this → "upcoming" (no urgency yet). */
  upcomingBeyondHours: 72,
  /** Between dueSoonFromHours and upcomingBeyondHours → "due_soon". */
  dueSoonFromHours: 24,
};

/** Age buckets for undated tasks, in days since creation/last activity. */
export const AGE_BUCKETS: { bucket: AgeBucket; minDays: number }[] = [
  { bucket: "very_stale", minDays: 30 },
  { bucket: "stale", minDays: 15 },
  { bucket: "aging", minDays: 8 },
  { bucket: "undated", minDays: 4 },
  { bucket: "new_undated", minDays: 0 },
];

/** Cooldown (hours) between interventions for the same task, by attempt number. */
export const COOLDOWN_BY_ATTEMPT_HOURS = [0, 24, 48, 120, 240];
export const COOLDOWN_MAX_HOURS = 336; // 14 days once heavily ignored

/** Frequency profiles multiply cooldowns and the daily budget. */
export const FREQUENCY_PROFILES: Record<
  FollowUpPrefs["frequency"],
  { cooldownMultiplier: number; budgetDelta: number; minScore: number }
> = {
  low: { cooldownMultiplier: 2, budgetDelta: -1, minScore: 45 },
  normal: { cooldownMultiplier: 1, budgetDelta: 0, minScore: 25 },
  high: { cooldownMultiplier: 0.5, budgetDelta: 2, minScore: 10 },
};

/** Never intervene on something the user just touched. */
export const QUIET_AFTER_ACTIVITY_HOURS = 12;
/** Never intervene on a brand-new task. */
export const QUIET_AFTER_CREATION_HOURS = 24;

/** Max important interventions per day (before frequency delta). */
export const DEFAULT_DAILY_BUDGET = 3;

/** Group interventions when this many or more share a project. */
export const GROUPING_MIN = 3;

export const DEFAULT_PREFS: FollowUpPrefs = {
  enabled: true,
  frequency: "normal",
  preferred_hour: 9,
  undated: true,
  stale_cleanup: true,
  daily_budget: DEFAULT_DAILY_BUDGET,
};

export function normalizePrefs(raw: unknown): FollowUpPrefs {
  const p = (raw ?? {}) as Partial<FollowUpPrefs>;
  const frequency: FollowUpPrefs["frequency"] =
    p.frequency === "low" || p.frequency === "high" ? p.frequency : "normal";
  const hour = Number(p.preferred_hour);
  const budget = Number(p.daily_budget);
  return {
    enabled: p.enabled !== false,
    frequency,
    preferred_hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : DEFAULT_PREFS.preferred_hour,
    undated: p.undated !== false,
    stale_cleanup: p.stale_cleanup !== false,
    daily_budget:
      Number.isFinite(budget) && budget >= 1 && budget <= 10 ? Math.floor(budget) : DEFAULT_DAILY_BUDGET,
  };
}

/** Base urgency score per derived state. */
export const STATE_SCORE: Record<string, number> = {
  overdue: 70,
  due_today: 60,
  blocked: 55,
  due_soon: 40,
  stale: 35,
  undated: 20,
  upcoming: 10,
  completed: 0,
  discarded: 0,
};

/** Priority weight added to the score. */
export const PRIORITY_SCORE: Record<string, number> = {
  urgent: 30,
  high: 20,
  medium: 8,
  low: 0,
};

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: "urgente",
  high: "alta",
  medium: "media",
  low: "baja",
};

export function priorityBand(score: number): InterventionPriority {
  if (score >= 90) return "critical";
  if (score >= 65) return "high";
  if (score >= 35) return "normal";
  return "low";
}

/** Task statuses considered "done" in this project. */
export const DONE_STATUSES = new Set(["listo", "completed", "done"]);
