// "Acciones del día" — tareas, recordatorios y reuniones del día combinados
// en una sola lista ordenada por urgencia.

import { useState } from "react";
import { IconChecklist, IconFolder, IconUser } from "@tabler/icons-react";
import { stripMentionSyntaxLoose } from "@/lib/mentions";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
};
type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
};
type Reminder = { id: string; title: string; datetime: string; done: boolean };

export interface DayActionsBlockProps {
  tasks: Task[];
  reminders: Reminder[];
  meetings: Meeting[];
  projectMap: Record<string, string>;
  contactMap: Record<string, string>;
  isOverdue: (date: string | null) => boolean;
  isToday: (date: string | null) => boolean;
  onToggleTask: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onToggleReminder: (reminder: Reminder) => void;
  onOpenReminder: (reminder: Reminder) => void;
  onOpenMeeting: (meeting: Meeting) => void;
}

type Row = {
  key: string;
  score: number;
  title: string;
  done: boolean;
  bar: string;
  badge: { label: string; color: string } | null;
  time: string | null;
  project?: string | undefined;
  person?: string | undefined;
  onToggle?: (() => void) | undefined;
  onOpen: () => void;
};

const RED = "#f87171";
const YELLOW = "#fbbf24";
const INDIGO = "#818cf8";
const GREY = "#222";

function hhmm(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function hasTime(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

export function DayActionsBlock({
  tasks,
  reminders,
  meetings,
  projectMap,
  contactMap,
  isOverdue,
  isToday,
  onToggleTask,
  onOpenTask,
  onToggleReminder,
  onOpenReminder,
  onOpenMeeting,
}: DayActionsBlockProps) {
  const rows: Row[] = [];
  const now = Date.now();
  const inTwoDays = (d: string | null) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t > now && t <= now + 2 * 86_400_000;
  };

  for (const t of tasks) {
    const done = t.status === "listo";
    const overdue = !done && isOverdue(t.due_date);
    const today = isToday(t.due_date);
    let score = 0;
    if (overdue) score += 100;
    else if (today) score += 80;
    else if (inTwoDays(t.due_date)) score += 60;
    if (t.priority === "high" || t.priority === "alta") score += 40;
    else if (t.priority === "medium" || t.priority === "media") score += 20;
    if (score === 0) continue;

    const badge = overdue
      ? { label: "vencida", color: RED }
      : today
        ? { label: "hoy", color: INDIGO }
        : t.priority === "high" || t.priority === "alta"
          ? { label: "alta prioridad", color: YELLOW }
          : { label: "próximamente", color: INDIGO };

    rows.push({
      key: `t-${t.id}`,
      score,
      title: stripMentionSyntaxLoose(t.title),
      done,
      bar: done ? GREY : overdue ? RED : badge.label === "alta prioridad" ? YELLOW : INDIGO,
      badge: done ? null : badge,
      time: hasTime(t.due_date) ? hhmm(t.due_date as string) : null,
      project: t.project_id ? projectMap[t.project_id] : undefined,
      person: t.assigned_to ? contactMap[t.assigned_to] : undefined,
      onToggle: () => onToggleTask(t),
      onOpen: () => onOpenTask(t),
    });
  }

  for (const m of meetings) {
    if (!isToday(m.datetime)) continue;
    rows.push({
      key: `m-${m.id}`,
      score: 75,
      title: stripMentionSyntaxLoose(m.title),
      done: false,
      bar: INDIGO,
      badge: { label: "reunión", color: INDIGO },
      time: hhmm(m.datetime),
      onOpen: () => onOpenMeeting(m),
    });
  }

  for (const r of reminders) {
    if (!isToday(r.datetime) && !(!r.done && isOverdue(r.datetime))) continue;
    const overdue = !r.done && isOverdue(r.datetime);
    rows.push({
      key: `r-${r.id}`,
      score: overdue ? 100 : 50,
      title: stripMentionSyntaxLoose(r.title),
      done: r.done,
      bar: r.done ? GREY : overdue ? RED : INDIGO,
      badge: r.done ? null : { label: overdue ? "vencido" : "recordatorio", color: overdue ? RED : INDIGO },
      time: hasTime(r.datetime) ? hhmm(r.datetime) : null,
      onToggle: () => onToggleReminder(r),
      onOpen: () => onOpenReminder(r),
    });
  }

  rows.sort((a, b) => Number(a.done) - Number(b.done) || b.score - a.score);
  const visibleRows = rows.filter((r) => !r.done);
  if (visibleRows.length === 0) return null;

  const [expanded, setExpanded] = useState(false);
  const displayRows = expanded ? visibleRows : visibleRows.slice(0, 5);
  const remaining = visibleRows.length - 5;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <IconChecklist size={15} stroke={1.75} style={{ color: "#818cf8" }} />
        <span style={{ fontSize: 10, letterSpacing: "0.12em", fontWeight: 700, color: "#818cf8" }}>
          ACCIONES DEL DÍA
        </span>
      </div>

      <div
        style={{
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderRadius: 12,
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {displayRows.map((row) => (
          <div
            key={row.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 9,
            }}
          >
            <span
              style={{
                width: 3,
                alignSelf: "stretch",
                minHeight: 26,
                borderRadius: 2,
                background: row.bar,
                flexShrink: 0,
              }}
            />

            {row.onToggle ? (
              <button
                type="button"
                aria-label="Marcar como hecha"
                onClick={row.onToggle}
                style={{
                  width: 16,
                  height: 16,
                  marginTop: 2,
                  borderRadius: 5,
                  border: "1px solid #333",
                  background: "transparent",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span style={{ width: 16, flexShrink: 0 }} />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={row.onOpen}
                style={{
                  fontSize: 13,
                  color: "#e6e6e6",
                  textAlign: "left",
                  background: "transparent",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                {row.title}
              </button>

              {(row.project || row.person || row.badge) && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 3 }}>
                  {row.project && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#666" }}>
                      <IconFolder size={12} stroke={1.75} style={{ color: "#555" }} />
                      {row.project}
                    </span>
                  )}
                  {row.person && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#666" }}>
                      <IconUser size={12} stroke={1.75} style={{ color: "#555" }} />
                      {row.person}
                    </span>
                  )}
                  {row.badge && (
                    <span
                      style={{
                        fontSize: 10,
                        color: row.badge.color,
                        border: `1px solid ${row.badge.color}33`,
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: 999,
                        padding: "1px 7px",
                      }}
                    >
                      {row.badge.label}
                    </span>
                  )}
                </div>
              )}
            </div>

            {row.time && (
              <span
                style={{
                  fontSize: 11,
                  color: "#444",
                  fontVariantNumeric: "tabular-nums",
                  marginTop: 1,
                  flexShrink: 0,
                }}
              >
                {row.time}
              </span>
            )}
          </div>
        ))}

        {!expanded && remaining > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              fontSize: 12,
              color: "#555",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 10px",
              textAlign: "left",
            }}
          >
            Ver {remaining} más
          </button>
        )}
      </div>
    </section>
  );
}
