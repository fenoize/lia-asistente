// "Necesita tu atención" — surface of the Task Follow-Up Engine.
// Runs the same pure engine used by the scheduled job, but locally, so the
// dashboard always reflects the current decision state and offers the quick
// actions ([Hoy] [Mañana] [Esta semana] [Descartar] ...) without opening the task.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconAlertTriangle,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconFeather,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
import { normalizePrefs } from "@/lib/followup/config";
import { deriveTaskState, evaluateTaskForFollowUp, summarizeAttention } from "@/lib/followup/engine";
import { generateTaskFollowUp } from "@/lib/followup/messages";
import type { FollowUpMemory, FollowUpPrefs, FollowUpTask, SuggestedAction, TaskState } from "@/lib/followup/types";

const ACTION_LABEL: Partial<Record<SuggestedAction, string>> = {
  today: "Hoy",
  tomorrow: "Mañana",
  this_week: "Esta semana",
  complete: "Hecha",
  start: "Hacer ahora",
  snooze: "Posponer",
  unblock: "Desbloquear",
  discard: "Descartar",
  open: "Ver tarea",
  pick_date: "Elegir fecha",
};

const ACTION_STYLE: Partial<Record<SuggestedAction, { color: string; border: string; background: string }>> = {
  complete: { color: "#4ade80", border: "rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.06)" },
  today: { color: "#818cf8", border: "rgba(129,140,248,0.2)", background: "rgba(129,140,248,0.05)" },
  tomorrow: { color: "#818cf8", border: "rgba(129,140,248,0.2)", background: "rgba(129,140,248,0.05)" },
  this_week: { color: "#818cf8", border: "rgba(129,140,248,0.2)", background: "rgba(129,140,248,0.05)" },
  pick_date: { color: "#818cf8", border: "rgba(129,140,248,0.2)", background: "rgba(129,140,248,0.05)" },
  open: { color: "#94a3b8", border: "#252525", background: "#151515" },
  discard: { color: "#f87171", border: "rgba(248,113,113,0.2)", background: "rgba(248,113,113,0.05)" },
};

const DEFAULT_ACTION_STYLE = { color: "#94a3b8", border: "#252525", background: "#151515" };

function stateIcon(state: TaskState) {
  if (state === "overdue" || state === "due_today")
    return { Icon: IconClock, color: "#f87171", background: "rgba(248,113,113,0.1)" };
  if (state === "stale" || state === "blocked")
    return { Icon: IconAlertTriangle, color: "#fbbf24", background: "rgba(251,191,36,0.08)" };
  return { Icon: IconCalendar, color: "#818cf8", background: "rgba(99,102,241,0.1)" };
}

const STATE_CHIPS: { key: string; label: string; color: string }[] = [
  { key: "overdue", label: "atrasadas", color: "#f87171" },
  { key: "due_today", label: "para hoy", color: "#fb923c" },
  { key: "due_soon", label: "próximas", color: "#fbbf24" },
  { key: "undated", label: "sin fecha", color: "#94a3b8" },
  { key: "stale", label: "estancadas", color: "#a78bfa" },
  { key: "blocked", label: "bloqueadas", color: "#f472b6" },
];

function atHour(base: Date, hour = 18) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function ProactiveFollowUpWidget({
  userId,
  onOpenTask,
}: {
  userId: string;
  onOpenTask?: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [memories, setMemories] = useState<Map<string, FollowUpMemory>>(new Map());
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [prefs, setPrefs] = useState<FollowUpPrefs>(normalizePrefs(null));
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [tasksRes, memRes, projRes, profRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, start_date, created_at, updated_at, project_id, project, discarded_at")
        .eq("user_id", userId)
        .neq("status", "listo")
        .is("discarded_at", null)
        .limit(200),
      supabase.from("task_followups").select("*").eq("user_id", userId),
      supabase.from("projects").select("id, name").eq("user_id", userId),
      supabase.from("profiles").select("followup_prefs").eq("id", userId).maybeSingle(),
    ]);
    setTasks((tasksRes.data ?? []) as unknown as FollowUpTask[]);
    setMemories(
      new Map(((memRes.data ?? []) as unknown as FollowUpMemory[]).map((m) => [m.task_id, m])),
    );
    setProjectNames(
      new Map(((projRes.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])),
    );
    setPrefs(normalizePrefs((profRes.data as { followup_prefs?: unknown } | null)?.followup_prefs));
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => summarizeAttention(tasks, memories), [tasks, memories]);

  const items = useMemo(() => {
    const now = new Date();
    // For the dashboard we ignore cooldowns (that's a notification concern) and
    // show what genuinely needs attention, ranked by the engine's score.
    return tasks
      .map((task) => {
        const memory = memories.get(task.id) ?? null;
        const evaluation = evaluateTaskForFollowUp(task, {
          memory: memory ? { ...memory, last_notification_at: null } : null,
          prefs: { ...prefs, enabled: true },
          now,
        });
        return { task, evaluation, memory };
      })
      .filter(({ evaluation }) => evaluation.should_notify)
      .sort((a, b) => b.evaluation.score - a.evaluation.score)
      .slice(0, 4)
      .map(({ task, evaluation, memory }) => {
        const projectName = task.project_id ? projectNames.get(task.project_id) ?? null : task.project ?? null;
        const { message } = generateTaskFollowUp(task, evaluation, {
          projectName,
          attempt: memory?.notification_count ?? 0,
          now,
        });
        return { task, evaluation, message };
      });
  }, [tasks, memories, projectNames, prefs]);

  const rememberResponse = async (taskId: string, response: string, patch: Partial<FollowUpMemory> = {}) => {
    await supabase.from("task_followups").upsert(
      {
        user_id: userId,
        task_id: taskId,
        user_response: response,
        responded_at: new Date().toISOString(),
        ...patch,
      } as never,
      { onConflict: "task_id" },
    );
  };

  const runAction = async (taskId: string, action: SuggestedAction) => {
    const now = new Date();
    if (action === "open") {
      if (onOpenTask) onOpenTask(taskId);
      else navigate({ to: "/tasks", search: { open: taskId } as never });
      return;
    }
    if (action === "pick_date") {
      if (onOpenTask) onOpenTask(taskId);
      else navigate({ to: "/tasks", search: { open: taskId } as never });
      return;
    }

    if (action === "today" || action === "tomorrow" || action === "this_week") {
      const target = new Date(now);
      if (action === "tomorrow") target.setDate(target.getDate() + 1);
      if (action === "this_week") target.setDate(target.getDate() + (7 - target.getDay() || 5));
      await supabase.from("tasks").update({ due_date: atHour(target) }).eq("id", taskId);
      await rememberResponse(taskId, `reschedule:${action}`, { dismissed: false, snoozed_until: null });
      toast.success(action === "today" ? "Agendada para hoy" : action === "tomorrow" ? "Agendada para mañana" : "Agendada esta semana");
    } else if (action === "complete") {
      await supabase.from("tasks").update({ status: "listo" }).eq("id", taskId);
      await rememberResponse(taskId, "completed");
      toast.success("Tarea marcada como lista");
    } else if (action === "start") {
      await supabase.from("tasks").update({ status: "en_curso" }).eq("id", taskId);
      await rememberResponse(taskId, "started");
      toast.success("Tarea en curso");
    } else if (action === "snooze") {
      const until = new Date(now.getTime() + 3 * 86_400_000).toISOString();
      await rememberResponse(taskId, "snoozed", { snoozed_until: until });
      toast.success("La retomamos en 3 días");
    } else if (action === "unblock") {
      await rememberResponse(taskId, "blocked", { blocked: true } as Partial<FollowUpMemory>);
      if (onOpenTask) onOpenTask(taskId);
      toast.info("Marcada como bloqueada");
    } else if (action === "discard") {
      await supabase.from("tasks").update({ discarded_at: now.toISOString() }).eq("id", taskId);
      await rememberResponse(taskId, "discarded", { dismissed: true });
      toast.success("Descartada");
    }
    await load();
  };

  if (!loaded || items.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--bg-elevated, #111)",
        border: "1px solid var(--border, #1e1e1e)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <IconFeather size={15} stroke={1.75} style={{ color: "#a78bfa" }} />
        <span style={{ fontSize: 10, letterSpacing: "0.12em", fontWeight: 700, color: "#a78bfa" }}>
          LIA SUGIERE
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {STATE_CHIPS.map((chip) => {
          const value = (counts as Record<string, number>)[chip.key] ?? 0;
          if (!value) return null;
          return (
            <span
              key={chip.key}
              style={{
                fontSize: 11,
                color: chip.color,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${chip.color}33`,
                borderRadius: 999,
                padding: "2px 9px",
              }}
            >
              {value} {chip.label}
            </span>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(({ task, evaluation, message }) => {
          const { Icon, color, background } = stateIcon(evaluation.task_state);
          return (
          <div
            key={task.id}
            style={{
              background: "#161616",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              padding: "11px 12px",
            }}
          >
            <button
              type="button"
              onClick={() => void runAction(task.id, "open")}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 9,
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                background: "transparent",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <Icon size={12} stroke={1.9} style={{ color }} />
              </span>
              <span style={{ fontSize: 13, color: "#e6e6e6", lineHeight: 1.45, flex: 1 }}>
                {stripMentionSyntaxLoose(message)}
              </span>
              <IconChevronRight size={14} stroke={1.75} style={{ color: "#555", marginTop: 3 }} />
            </button>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
              {evaluation.suggested_actions.map((action) => {
                const s = ACTION_STYLE[action] ?? DEFAULT_ACTION_STYLE;
                return (
                  <button
                    key={action}
                    type="button"
                    onClick={() => void runAction(task.id, action)}
                    style={{
                      fontSize: 11,
                      color: s.color,
                      background: s.background,
                      border: `1px solid ${s.border}`,
                      borderRadius: 999,
                      padding: "4px 11px",
                      cursor: "pointer",
                    }}
                  >
                    {ACTION_LABEL[action] ?? action}
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

export { deriveTaskState };
