import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconTrash, IconCheck, IconLayoutGrid, IconTable } from "@tabler/icons-react";
import { toast } from "sonner";
import { EditTaskModal, type EditableTask } from "@/components/tasks/edit-task-modal";

type ViewMode = "cards" | "table";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  project: string | null;
  project_id: string | null;
  description: string | null;
};

type ProjectOption = { id: string; name: string };

type Filter = "all" | "urgent" | "today" | "week" | "done";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "urgent", label: "Urgente" },
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "done", label: "Completadas" },
];

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  borrador: { label: "Borrador", color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.3)" },
  en_curso: { label: "En Curso", color: "#a78bfa", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" },
  listo: { label: "Listo", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
};

const startOfToday = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
};
const endOfToday = () => {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d;
};
const endOfWeek = () => {
  const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 59, 999); return d;
};

function openCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    return (window.localStorage.getItem("tasks:view") as ViewMode) || "cards";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("tasks:view", view);
  }, [view]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [t, p] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase.from("projects").select("id,name").order("name"),
      ]);
      setTasks((t.data as Task[]) ?? []);
      setProjects((p.data as ProjectOption[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "done") return t.status === "listo";
      if (t.status === "listo") return false;
      if (filter === "urgent") return t.priority === "high" || t.priority === "urgent";
      if (filter === "today") {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        return d <= endOfToday() && d >= startOfToday();
      }
      if (filter === "week") {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        return d <= endOfWeek();
      }
      return true;
    });
  }, [tasks, filter]);

  const groups = useMemo(() => {
    const urgent: Task[] = [], week: Task[] = [], later: Task[] = [];
    for (const t of filtered) {
      if (t.priority === "high" || t.priority === "urgent") { urgent.push(t); continue; }
      if (!t.due_date) { later.push(t); continue; }
      const d = new Date(t.due_date);
      if (d <= endOfWeek()) week.push(t);
      else later.push(t);
    }
    return { urgent, week, later };
  }, [filtered]);

  const toggle = async (t: Task) => {
    const status = t.status === "listo" ? "borrador" : "listo";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    const { error } = await supabase.from("tasks").update({ status }).eq("id", t.id);
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const updateTask = (updated: EditableTask) => {
    setTasks((prev) =>
      prev.map((x) =>
        x.id === updated.id
          ? {
              ...x,
              title: updated.title,
              description: updated.description,
              priority: updated.priority,
              status: updated.status,
              start_date: updated.start_date,
              due_date: updated.due_date,
              project_id: updated.project_id,
            }
          : x,
      ),
    );
  };
  const removeTask = (id: string) => setTasks((prev) => prev.filter((x) => x.id !== id));

  const patchInline = async (id: string, patch: Partial<Task>) => {
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  };


  const counts = useMemo(() => tasks.filter((t) => t.status !== "listo").length, [tasks]);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center" style={{ gap: 8 }}>
          <h1 className="alfred-h1">Tareas</h1>
          <span
            style={{
              fontSize: 11,
              color: "#666",
              padding: "2px 10px",
              borderRadius: 100,
              background: "#1a1a1a",
              border: "1px solid #222",
            }}
          >
            {counts}
          </span>
        </div>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva tarea
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                fontSize: 12,
                padding: "6px 16px",
                borderRadius: 100,
                border: active
                  ? "1px solid rgba(99,102,241,0.3)"
                  : "1px solid #222",
                background: active ? "rgba(99,102,241,0.15)" : "transparent",
                color: active ? "#818cf8" : "#555",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList />
      ) : filtered.length === 0 ? (
        <Empty
          title="Cero tareas en esta lista."
          subtitle="Capturalas con ⌘K o el botón Nueva tarea."
        />
      ) : (
        <div className="space-y-6">
          {(["urgent", "week", "later"] as const).map((g) => {
            const list = groups[g];
            if (!list.length) return null;
            const label =
              g === "urgent" ? "URGENTE" : g === "week" ? "ESTA SEMANA" : "MÁS ADELANTE";
            return (
              <section key={g}>
                <div className="alfred-section-label">{label}</div>
                <ul style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {list.map((t: Task) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onOpen={() => setEditing(t)}
                      onToggle={() => toggle(t)}
                      onRemove={() => remove(t.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <EditTaskModal
          task={{
            id: editing.id,
            title: editing.title,
            description: editing.description,
            priority: editing.priority,
            status: editing.status,
            start_date: editing.start_date,
            due_date: editing.due_date,
            project_id: editing.project_id,
          }}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={updateTask}
          onDeleted={removeTask}
        />
      )}
    </div>
  );
}

function formatRange(start: string | null, end: string | null): string | null {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("es-CL", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (end) return fmt(end);
  if (start) return `desde ${fmt(start)}`;
  return null;
}

function TaskRow({
  task, onOpen, onToggle, onRemove,
}: {
  task: Task;
  onOpen: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const isMobile = useIsMobile();
  const done = task.status === "listo";
  const overdue = !!task.due_date && new Date(task.due_date) < new Date() && !done;
  const rangeText = formatRange(task.start_date, task.due_date);

  const checkBtn = (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={done ? "Marcar pendiente" : "Marcar listo"}
      style={{
        width: 16, height: 16, borderRadius: "50%",
        border: `1.5px solid ${done ? "#22c55e" : "#333"}`,
        background: done ? "#22c55e" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transition: "transform 120ms ease, background 120ms ease",
      }}
      className="hover:scale-110"
    >
      {done && <IconCheck size={10} stroke={3} color="white" />}
    </button>
  );

  if (isMobile) {
    return (
      <li
        className="group cursor-pointer transition-colors"
        style={{ padding: "10px 12px", borderRadius: 8 }}
        onClick={onOpen}
      >
        <div className="flex items-start gap-3">
          <div style={{ marginTop: 2 }}>{checkBtn}</div>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 14,
                color: done ? "#444" : "#ccc",
                textDecoration: done ? "line-through" : "none",
                wordBreak: "break-word",
                lineHeight: 1.35,
              }}
            >
              {task.title}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 6 }}>
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {rangeText && (
                <span
                  style={{
                    fontSize: 11,
                    color: overdue ? "#f87171" : "#555",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rangeText}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label="Eliminar"
            style={{ color: "#666", padding: 4 }}
            className="hover:text-red-400"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className="group flex items-center gap-3 transition-colors cursor-pointer"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
      }}
      onClick={onOpen}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#0f0f0f";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {checkBtn}

      <span
        className="flex-1 truncate"
        style={{
          fontSize: 14,
          color: done ? "#444" : "#ccc",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>

      <StatusBadge status={task.status} />
      <PriorityBadge priority={task.priority} />

      {rangeText && (
        <span
          style={{
            fontSize: 12,
            color: overdue ? "#f87171" : "#555",
            whiteSpace: "nowrap",
          }}
        >
          {rangeText}
        </span>
      )}

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label="Eliminar"
          style={{ color: "#666", padding: 4 }}
          className="hover:text-red-400"
        >
          <IconTrash size={14} />
        </button>
      </div>
    </li>
  );
}


function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.borrador;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 10px",
        borderRadius: 100,
        background: m.bg,
        color: m.color,
        border: `1px solid ${m.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<
    string,
    { label: string; bg: string; color: string; border: string }
  > = {
    urgent: {
      label: "Alta",
      bg: "rgba(220,38,38,0.1)",
      color: "#f87171",
      border: "1px solid rgba(220,38,38,0.2)",
    },
    high: {
      label: "Alta",
      bg: "rgba(220,38,38,0.1)",
      color: "#f87171",
      border: "1px solid rgba(220,38,38,0.2)",
    },
    medium: {
      label: "Media",
      bg: "rgba(217,119,6,0.1)",
      color: "#fbbf24",
      border: "1px solid rgba(217,119,6,0.2)",
    },
    low: {
      label: "Baja",
      bg: "transparent",
      color: "#444",
      border: "1px solid #222",
    },
  };
  const m = map[priority] ?? map.medium;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 10px",
        borderRadius: 100,
        background: m.bg,
        color: m.color,
        border: m.border,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 32, borderRadius: "var(--radius-md)",
            background: "var(--bg-elevated)", opacity: 0.5,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center" style={{ padding: "60px 0" }}>
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{title}</p>
      {subtitle && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>{subtitle}</p>}
    </div>
  );
}
