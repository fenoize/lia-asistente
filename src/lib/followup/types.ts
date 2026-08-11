// Shared types for the Follow-Up Engine.
// The engine is intentionally entity-agnostic at the type level so it can be
// extended later to projects, payments, meetings, habits, etc.

export type TaskState =
  | "completed"
  | "discarded"
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "undated"
  | "stale"
  | "blocked";

export type NotificationIntent =
  | "anticipate"
  | "prepare"
  | "activate"
  | "resolve"
  | "schedule"
  | "clarify"
  | "unblock"
  | "discard";

/** Age buckets for tasks without a due date. */
export type AgeBucket = "new_undated" | "undated" | "aging" | "stale" | "very_stale";

export type SuggestedAction =
  | "open"
  | "complete"
  | "start"
  | "today"
  | "tomorrow"
  | "this_week"
  | "pick_date"
  | "snooze"
  | "unblock"
  | "discard";

export type InterventionPriority = "critical" | "high" | "normal" | "low";

/** Minimal task shape the engine needs. Anything richer is ignored. */
export type FollowUpTask = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  start_date?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  project_id?: string | null;
  project?: string | null;
  discarded_at?: string | null;
};

/** Persisted follow-up memory for a task (row of public.task_followups). */
export type FollowUpMemory = {
  task_id: string;
  notification_count: number;
  last_notification_at: string | null;
  last_state: string | null;
  last_intent: string | null;
  last_message: string | null;
  user_response: string | null;
  responded_at?: string | null;
  snoozed_until: string | null;
  dismissed: boolean;
  blocked: boolean;
  blocked_reason: string | null;
};

export type FollowUpPrefs = {
  enabled: boolean;
  frequency: "low" | "normal" | "high";
  preferred_hour: number;
  undated: boolean;
  stale_cleanup: boolean;
  daily_budget: number;
};

export type Evaluation = {
  task_id: string;
  should_notify: boolean;
  task_state: TaskState;
  age_bucket: AgeBucket | null;
  notification_intent: NotificationIntent;
  priority: InterventionPriority;
  /** Numeric urgency used for daily budget ranking. Higher wins. */
  score: number;
  reason: string;
  cooldown_until: string | null;
  suggested_actions: SuggestedAction[];
};

export type Intervention = {
  evaluation: Evaluation;
  task: FollowUpTask;
  projectName: string | null;
  title: string;
  message: string;
  /** Stable anchor used to dedupe the notification row. */
  anchor: string;
};

export type GroupedIntervention = {
  kind: "grouped";
  taskIds: string[];
  projectName: string | null;
  title: string;
  message: string;
  anchor: string;
  primary: Intervention;
};
