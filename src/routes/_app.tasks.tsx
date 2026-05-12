import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconTrash, IconCheck } from "@tabler/icons-react";
import { toast } from "sonner";
import { EditTaskModal, type EditableTask } from "@/components/tasks/edit-task-modal";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
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
    const now = new Date();
    return tasks.filter((t) => {
      if (filter === "done") return t.status === "done";
      if (t.status === "done") return false;
      if (filter === "urgent") return t.priority === "high";
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
    const status = t.status === "done" ? "pending" : "done";
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
              due_date: updated.due_date,
              project_id: updated.project_id,
            }
          : x,
      ),
    );
  };
  const removeTask = (id: string) => setTasks((prev) => prev.filter((x) => x.id !== id));


  const counts = useMemo(() => tasks.filter((t) => t.status !== "done").length, [tasks]);

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
            due_date: editing.due_date,
            project_id: editing.project_id,
            status: editing.status,
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

function TaskRow({
  task, editing, editValue, onEditChange, onCommit, onCancel,
  onStartEdit, onToggle, onRemove,
}: {
  task: Task;
  editing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onStartEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const done = task.status === "done";
  const overdue = !!task.due_date && new Date(task.due_date) < new Date() && !done;

  return (
    <li
      className="group flex items-center gap-3 transition-colors"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#0f0f0f";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <button
        onClick={onToggle}
        aria-label={done ? "Marcar pendiente" : "Marcar completada"}
        style={{
          width: 16, height: 16, borderRadius: "50%",
          border: `1.5px solid ${done ? "var(--accent-color)" : "#333"}`,
          background: done ? "var(--accent-color)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "transform 120ms ease, background 120ms ease",
        }}
        className="hover:scale-110"
      >
        {done && <IconCheck size={10} stroke={3} color="white" />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          className="flex-1 bg-transparent border-0 outline-none"
          style={{ fontSize: 14, color: "#ccc" }}
        />
      ) : (
        <span
          onClick={onStartEdit}
          className="flex-1 cursor-text truncate"
          style={{
            fontSize: 14,
            color: done ? "#444" : "#ccc",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {task.title}
        </span>
      )}

      <PriorityBadge priority={task.priority} />

      {task.due_date && (
        <span
          style={{
            fontSize: 12,
            color: overdue ? "#f87171" : "#555",
          }}
        >
          {new Date(task.due_date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
        </span>
      )}

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        <button onClick={onStartEdit} aria-label="Editar"
          style={{ color: "#666", padding: 4 }}>
          <IconPencil size={14} />
        </button>
        <button onClick={onRemove} aria-label="Eliminar"
          style={{ color: "#666", padding: 4 }}
          className="hover:text-red-400">
          <IconTrash size={14} />
        </button>
      </div>
    </li>
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
