import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconLayoutGrid,
  IconLayoutKanban,
  IconTable,
  IconTimeline,
  IconChevronDown,
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { EditTaskModal, type EditableTask } from "@/components/tasks/edit-task-modal";
import {
  addDays,
  subDays,
  differenceInDays,
  parseISO,
  startOfDay,
  format,
  isSameDay,
} from "date-fns";
import { es } from "date-fns/locale";

type ViewMode = "cards" | "kanban" | "table" | "gantt";

export const Route = createFileRoute("/_app/tasks")({
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
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

type FilterStatus = "all" | "borrador" | "en_curso" | "listo";
type FilterDate = "all" | "day" | "week" | "month";

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  borrador: { label: "Borrador", color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.3)" },
  en_curso: { label: "En Curso", color: "#a78bfa", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" },
  listo: { label: "Listo", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
};

const PROJECT_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899","#8b5cf6","#14b8a6","#f97316"];
function projectColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

function openCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterDate, setFilterDate] = useState<FilterDate>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
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

  const navigate = useNavigate();
  const { open: openId } = Route.useSearch();
  useEffect(() => {
    if (!openId || !user) return;
    (async () => {
      const { data } = await supabase.from("tasks").select("*").eq("id", openId).maybeSingle();
      if (data) setEditing(data as Task);
      navigate({ to: "/tasks", search: {} as any, replace: true });
    })();
  }, [openId, user, navigate]);


  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  // Unique projects from the loaded tasks
  const taskProjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.project_id) {
        const name = projectMap.get(t.project_id) ?? t.project ?? "Proyecto";
        if (!seen.has(t.project_id)) seen.set(t.project_id, name);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [tasks, projectMap]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (filterStatus !== "all") filtered = filtered.filter((t) => t.status === filterStatus);
    if (filterProject !== "all") filtered = filtered.filter((t) => t.project_id === filterProject);
    if (filterDate !== "all") {
      const now = startOfDay(new Date());
      filtered = filtered.filter((t) => {
        const start = t.start_date ? parseISO(t.start_date) : t.due_date ? parseISO(t.due_date) : null;
        const end = t.due_date ? parseISO(t.due_date) : start;
        if (!start || !end) return false;
        if (filterDate === "day") return start <= now && end >= now;
        if (filterDate === "week") return start <= addDays(now, 7) && end >= now;
        if (filterDate === "month") return start <= addDays(now, 30) && end >= now;
        return true;
      });
    }
    return filtered;
  }, [tasks, filterStatus, filterProject, filterDate]);

  const groups = useMemo(() => {
    const endOfWeek = addDays(startOfDay(new Date()), 7);
    const urgent: Task[] = [], week: Task[] = [], later: Task[] = [];
    for (const t of filteredTasks) {
      if (t.status === "listo" && filterStatus === "all") {
        later.push(t);
        continue;
      }
      if (t.priority === "high" || t.priority === "urgent") { urgent.push(t); continue; }
      if (!t.due_date) { later.push(t); continue; }
      const d = new Date(t.due_date);
      if (d <= endOfWeek) week.push(t);
      else later.push(t);
    }
    return { urgent, week, later };
  }, [filteredTasks, filterStatus]);

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

      {/* Filters + view bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Estado"
          value={filterStatus}
          onChange={(v) => setFilterStatus(v as FilterStatus)}
          options={[
            { id: "all", label: "Todos" },
            { id: "borrador", label: "Borrador", color: STATUS_META.borrador.color },
            { id: "en_curso", label: "En Curso", color: STATUS_META.en_curso.color },
            { id: "listo", label: "Listo", color: STATUS_META.listo.color },
          ]}
        />
        <FilterDropdown
          label="Fecha"
          value={filterDate}
          onChange={(v) => setFilterDate(v as FilterDate)}
          options={[
            { id: "all", label: "Siempre" },
            { id: "day", label: "Hoy" },
            { id: "week", label: "Semana" },
            { id: "month", label: "Mes" },
          ]}
        />
        {taskProjects.length > 0 && (
          <FilterDropdown
            label="Proyecto"
            value={filterProject}
            onChange={(v) => setFilterProject(v)}
            options={[
              { id: "all", label: "Todos" },
              ...taskProjects.map((p) => ({
                id: p.id,
                label: p.name,
                color: projectColor(p.name),
              })),
            ]}
          />
        )}

        <div className="ml-auto flex" style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 100, padding: 2 }}>
          {(["cards", "kanban", "table", "gantt"] as const).map((v) => {
            const active = view === v;
            const Icon =
              v === "cards" ? IconLayoutGrid :
              v === "kanban" ? IconLayoutKanban :
              v === "table" ? IconTable : IconTimeline;
            const label =
              v === "cards" ? "Cards" :
              v === "kanban" ? "Kanban" :
              v === "table" ? "Tabla" : "Gantt";
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={`Vista ${label}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 100,
                  background: active ? "rgba(99,102,241,0.18)" : "transparent",
                  color: active ? "#818cf8" : "#666",
                  transition: "all 0.15s",
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <SkeletonList />
      ) : filteredTasks.length === 0 ? (
        <Empty title="Cero tareas en esta lista." subtitle="Capturalas con ⌘K o el botón Nueva tarea." />
      ) : view === "table" ? (
        <TaskTable
          tasks={filteredTasks}
          projects={projects}
          onOpen={(t) => setEditing(t)}
          onPatch={patchInline}
          onRemove={remove}
        />
      ) : view === "gantt" ? (
        <GanttView tasks={filteredTasks} projectMap={projectMap} onOpen={(t) => setEditing(t)} onPatch={patchInline} />
      ) : view === "kanban" ? (
        <KanbanView tasks={filteredTasks} onOpen={(t) => setEditing(t)} onPatch={patchInline} />
      ) : (
        <div className="space-y-3">
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

type DropdownOption = { id: string; label: string; color?: string };

function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? options[0];
  const isAll = selected?.id === "all";
  const accent = selected?.color ?? "#818cf8";

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          padding: "6px 10px 6px 12px",
          borderRadius: 100,
          whiteSpace: "nowrap",
          border: !isAll ? `1px solid ${accent}66` : "1px solid #222",
          background: !isAll ? `${accent}22` : "transparent",
          color: !isAll ? accent : "#999",
          transition: "all 0.15s",
        }}
      >
        {selected?.color && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: selected.color,
              display: "inline-block",
            }}
          />
        )}
        <span style={{ color: "#666" }}>{label}:</span>
        <span>{selected?.label}</span>
        <IconChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            minWidth: 180,
            background: "#0d0d0d",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {options.map((o) => {
            const active = o.id === value;
            return (
              <button
                key={o.id}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: active ? "rgba(99,102,241,0.15)" : "transparent",
                  color: active ? "#a5b4fc" : "#ccc",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "#161616";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                {o.color ? (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: o.color,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <span style={{ width: 8, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>{o.label}</span>
                {active && <IconCheck size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  dotColor,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dotColor?: string;
  activeColor?: string;
}) {
  const accent = activeColor ?? "#818cf8";
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "6px 14px",
        borderRadius: 100,
        whiteSpace: "nowrap",
        border: active ? `1px solid ${accent}66` : "1px solid #222",
        background: active ? `${accent}22` : "transparent",
        color: active ? accent : "#666",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
    >
      {dotColor && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dotColor,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </button>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 18,
        background: "#222",
        flexShrink: 0,
        margin: "0 4px",
      }}
    />
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
      <MobileSwipeRow
        onTap={onOpen}
        onDelete={onRemove}
      >
        <div className="flex items-start gap-3" style={{ padding: "7px 6px" }}>
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
              {stripMentionSyntaxLoose(task.title)}
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
        </div>
      </MobileSwipeRow>
    );
  }

  return (
    <li
      className="group flex items-center gap-3 transition-colors cursor-pointer"
      style={{
        padding: "7px 10px",
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
        {stripMentionSyntaxLoose(task.title)}
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

const SWIPE = 72;

// Track which row is currently swiped open so opening another closes it.
let __openSwipeSetter: ((open: boolean) => void) | null = null;

function MobileSwipeRow({
  children,
  onTap,
  onDelete,
}: {
  children: React.ReactNode;
  onTap: () => void;
  onDelete: () => void;
}) {
  const [tx, setTx] = useState(0);
  const [open, setOpen] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    base: number;
    dragging: boolean;
    decided: "horiz" | "vert" | null;
  } | null>(null);

  // Register/unregister with the global "only one open" tracker.
  useEffect(() => {
    if (open) {
      if (__openSwipeSetter && __openSwipeSetter !== setOpenWithReset) {
        __openSwipeSetter(false);
      }
      __openSwipeSetter = setOpenWithReset;
    } else if (__openSwipeSetter === setOpenWithReset) {
      __openSwipeSetter = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setOpenWithReset(v: boolean) {
    setOpen(v);
    setTx(v ? -SWIPE : 0);
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      base: open ? -SWIPE : 0,
      dragging: false,
      decided: null,
    };

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      if (!s.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        s.decided = Math.abs(dx) > Math.abs(dy) ? "horiz" : "vert";
        if (s.decided === "horiz") s.dragging = true;
        else {
          // Vertical scroll — let the page handle it.
          cleanup();
          return;
        }
      }
      if (s.dragging) {
        ev.preventDefault();
        const next = Math.max(-SWIPE, Math.min(0, s.base + dx));
        setTx(next);
      }
    };

    const onUp = (ev: PointerEvent) => {
      const s = dragRef.current;
      cleanup();
      if (!s) return;
      if (!s.dragging) {
        // Tap — but if row is open, first tap closes it
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
          if (open) {
            setOpenWithReset(false);
          } else {
            onTap();
          }
        }
        return;
      }
      const dx = ev.clientX - s.startX;
      const final = s.base + dx;
      if (final < -SWIPE / 2) setOpenWithReset(true);
      else setOpenWithReset(false);
    };

    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    }

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  return (
    <li
      style={{
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      {/* Back layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(239,68,68,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 16,
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Eliminar"
          style={{
            color: "#f87171",
            padding: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
          }}
        >
          <IconTrash size={16} />
        </button>
      </div>
      {/* Front layer */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: "relative",
          background: "var(--bg-base, #08081a)",
          transform: `translateX(${tx}px)`,
          transition: dragRef.current?.dragging ? "none" : "transform 180ms ease",
          willChange: "transform",
        }}
      >
        {children}
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

type SortKey = "title" | "status" | "priority" | "due" | null;
type SortDir = "asc" | "desc";

const STATUS_RANK: Record<string, number> = { borrador: 0, en_curso: 1, listo: 2 };
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 0, medium: 1, low: 2 };

function TaskTable({
  tasks,
  projects,
  onOpen,
  onPatch,
  onRemove,
}: {
  tasks: Task[];
  projects: ProjectOption[];
  onOpen: (t: Task) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onRemove: (id: string) => void;
}) {
  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSort = (k: Exclude<SortKey, null>) => {
    if (sortKey !== k) {
      setSortKey(k);
      setSortDir("asc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const sortFn = useCallback(
    (a: Task, b: Task) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "title") return a.title.localeCompare(b.title) * dir;
      if (sortKey === "status")
        return ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)) * dir;
      if (sortKey === "priority")
        return ((PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)) * dir;
      if (sortKey === "due") {
        const ad = a.due_date ? new Date(a.due_date).getTime() : null;
        const bd = b.due_date ? new Date(b.due_date).getTime() : null;
        if (ad === null && bd === null) return 0;
        if (ad === null) return 1;
        if (bd === null) return -1;
        return (ad - bd) * dir;
      }
      return 0;
    },
    [sortKey, sortDir],
  );

  // Group by project
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; tasks: Task[] }>();
    for (const t of tasks) {
      const pid = t.project_id ?? "__none__";
      const name = t.project_id ? projectMap.get(t.project_id) ?? "Proyecto" : "Sin proyecto";
      if (!map.has(pid)) map.set(pid, { id: pid, name, tasks: [] });
      map.get(pid)!.tasks.push(t);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey) for (const g of arr) g.tasks = [...g.tasks].sort(sortFn);
    return arr;
  }, [tasks, projectMap, sortKey, sortFn]);

  const allVisibleIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const allSelected = selected.size > 0 && allVisibleIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSelected((s) => {
      if (allVisibleIds.every((id) => s.has(id))) return new Set();
      return new Set(allVisibleIds);
    });
  };
  const toggleGroup = (gid: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });
  };

  const bulkStatus = (status: string) => {
    selected.forEach((id) => onPatch(id, { status }));
  };
  const bulkDelete = () => {
    if (!confirm(`¿Eliminar ${selected.size} tarea(s)?`)) return;
    selected.forEach((id) => onRemove(id));
    setSelected(new Set());
  };

  const SortIndicator = ({ k }: { k: Exclude<SortKey, null> }) =>
    sortKey === k ? (
      sortDir === "asc" ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />
    ) : null;

  const sortableTh = (k: Exclude<SortKey, null>, label: string) => (
    <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(k)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label} <SortIndicator k={k} />
      </span>
    </th>
  );

  return (
    <div>
      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 8,
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: 10,
            fontSize: 12,
            color: "#a5b4fc",
            flexWrap: "wrap",
          }}
        >
          <span>{selected.size} seleccionada(s)</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                bulkStatus(e.target.value);
                e.target.value = "";
              }
            }}
            style={inlineSelect}
          >
            <option value="" disabled>Cambiar estado…</option>
            <option value="borrador">Borrador</option>
            <option value="en_curso">En Curso</option>
            <option value="listo">Listo</option>
          </select>
          <button
            onClick={bulkDelete}
            style={{
              fontSize: 12,
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              padding: "3px 10px",
            }}
          >
            Eliminar
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ fontSize: 12, color: "#888", padding: "3px 10px" }}
          >
            Cancelar
          </button>
        </div>
      )}
      <div
        className="overflow-x-auto"
        style={{ border: "1px solid #1e1e1e", borderRadius: 12, background: "#0a0a0a" }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={{ ...thStyle, width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ accentColor: "#818cf8", cursor: "pointer" }}
                />
              </th>
              {sortableTh("title", "Tarea")}
              {sortableTh("status", "Estado")}
              {sortableTh("priority", "Prioridad")}
              {sortableTh("due", "Término")}
              <th style={{ ...thStyle, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.id);
              const accent = g.id === "__none__" ? "#555" : projectColor(g.name);
              return (
                <>
                  <tr
                    key={`h-${g.id}`}
                    style={{
                      borderTop: "1px solid #1e1e1e",
                      background: "#0c0c0c",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleGroup(g.id)}
                  >
                    <td colSpan={6} style={{ padding: "8px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#bbb" }}>
                        {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
                        <span style={{ fontWeight: 500 }}>{g.name}</span>
                        <span style={{ color: "#555", fontSize: 11 }}>· {g.tasks.length}</span>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed &&
                    g.tasks.map((t) => {
                      const done = t.status === "listo";
                      const overdue = !!t.due_date && new Date(t.due_date) < new Date() && !done;
                      const isSel = selected.has(t.id);
                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderTop: "1px solid #141414",
                            cursor: "pointer",
                            background: isSel ? "rgba(99,102,241,0.08)" : "transparent",
                          }}
                          onClick={() => onOpen(t)}
                          onMouseEnter={(e) => {
                            if (!isSel) e.currentTarget.style.background = "#0f0f0f";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSel) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSelect(t.id)}
                              style={{ accentColor: "#818cf8", cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ ...tdStyle, color: done ? "#444" : "#ddd", textDecoration: done ? "line-through" : "none" }}>
                            {stripMentionSyntaxLoose(t.title)}
                          </td>
                          <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.status}
                              onChange={(e) => onPatch(t.id, { status: e.target.value })}
                              style={inlineSelect}
                            >
                              <option value="borrador">Borrador</option>
                              <option value="en_curso">En Curso</option>
                              <option value="listo">Listo</option>
                            </select>
                          </td>
                          <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.priority}
                              onChange={(e) => onPatch(t.id, { priority: e.target.value })}
                              style={inlineSelect}
                            >
                              <option value="urgent">Urgente</option>
                              <option value="high">Alta</option>
                              <option value="medium">Media</option>
                              <option value="low">Baja</option>
                            </select>
                          </td>
                          <td style={{ ...tdStyle, color: overdue ? "#f87171" : "#888" }}>
                            {t.due_date
                              ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(new Date(t.due_date))
                              : "—"}
                          </td>
                          <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => onRemove(t.id)}
                              aria-label="Eliminar"
                              style={{ color: "#555", padding: 4 }}
                              className="hover:text-red-400"
                            >
                              <IconTrash size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 14px", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" };
const inlineSelect: React.CSSProperties = {
  fontSize: 12,
  background: "transparent",
  border: "1px solid #1e1e1e",
  color: "#ccc",
  borderRadius: 6,
  padding: "3px 8px",
  colorScheme: "dark",
};

/* -------------------- Gantt View -------------------- */

const LEFT_W = 140;

type GanttZoom = "week" | "month" | "quarter";
const GANTT_PRESETS: Record<GanttZoom, { days: number; dayW: number; label: string }> = {
  week: { days: 10, dayW: 46, label: "Semana" },
  month: { days: 28, dayW: 32, label: "Mes" },
  quarter: { days: 70, dayW: 13, label: "Trimestre" },
};

const GANTT_COLORS = {
  borrador: { bg: "rgba(148,163,184,0.15)", border: "rgba(148,163,184,0.3)", text: "#94a3b8" },
  en_curso: { bg: "rgba(139,92,246,0.2)", border: "rgba(139,92,246,0.4)", text: "#a78bfa" },
  listo: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", text: "#4ade80" },
  overdue: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)", text: "#f87171" },
};

function GanttView({
  tasks,
  projectMap,
  onOpen,
  onPatch,
}: {
  tasks: Task[];
  projectMap: Map<string, string>;
  onOpen: (t: Task) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}) {
  const [zoom, setZoom] = useState<GanttZoom>(() => {
    if (typeof window === "undefined") return "month";
    return (window.localStorage.getItem("tasks:ganttZoom") as GanttZoom) || "month";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("tasks:ganttZoom", zoom);
  }, [zoom]);

  const preset = GANTT_PRESETS[zoom];
  const DAY_W = preset.dayW;
  const GANTT_DAYS = preset.days;

  const ganttStart = useMemo(
    () => subDays(startOfDay(new Date()), Math.floor(GANTT_DAYS / 5)),
    [GANTT_DAYS],
  );
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: GANTT_DAYS }, (_, i) => addDays(ganttStart, i)),
    [ganttStart, GANTT_DAYS],
  );

  const { dated, undated } = useMemo(() => {
    const dated: Task[] = [];
    const undated: Task[] = [];
    for (const t of tasks) {
      if (t.start_date || t.due_date) dated.push(t);
      else undated.push(t);
    }
    return { dated, undated };
  }, [tasks]);

  // Group dated tasks by project
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; tasks: Task[] }>();
    for (const t of dated) {
      const pid = t.project_id ?? "__none__";
      const name = t.project_id ? projectMap.get(t.project_id) ?? "Proyecto" : "Sin proyecto";
      if (!map.has(pid)) map.set(pid, { id: pid, name, tasks: [] });
      map.get(pid)!.tasks.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [dated, projectMap]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (gid: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });
  };

  const totalWidth = LEFT_W + GANTT_DAYS * DAY_W;

  return (
    <div
      style={{
        border: "1px solid #1e1e1e",
        borderRadius: 12,
        background: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      {/* Zoom toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #1e1e1e",
          fontSize: 12,
          color: "#888",
        }}
      >
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555" }}>
          Zoom
        </span>
        <div style={{ display: "flex", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 100, padding: 2 }}>
          {(Object.keys(GANTT_PRESETS) as GanttZoom[]).map((z) => {
            const active = zoom === z;
            return (
              <button
                key={z}
                onClick={() => setZoom(z)}
                style={{
                  fontSize: 11,
                  padding: "4px 12px",
                  borderRadius: 100,
                  background: active ? "rgba(99,102,241,0.18)" : "transparent",
                  color: active ? "#818cf8" : "#666",
                }}
              >
                {GANTT_PRESETS[z].label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: totalWidth, position: "relative" }}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #1e1e1e",
              position: "sticky",
              top: 0,
              background: "#0a0a0a",
              zIndex: 5,
            }}
          >
            <div
              style={{
                width: LEFT_W,
                flexShrink: 0,
                position: "sticky",
                left: 0,
                background: "#0a0a0a",
                zIndex: 6,
                padding: "10px 12px",
                fontSize: 11,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderRight: "1px solid #1e1e1e",
              }}
            >
              Tarea
            </div>
            {days.map((d, i) => {
              const isToday = isSameDay(d, today);
              return (
                <div
                  key={i}
                  style={{
                    width: DAY_W,
                    flexShrink: 0,
                    textAlign: "center",
                    padding: "6px 0",
                    fontSize: 10,
                    color: isToday ? "#818cf8" : "#666",
                    borderRight: "1px solid #141414",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{format(d, "d")}</div>
                  <div style={{ textTransform: "uppercase" }}>
                    {format(d, "EEE", { locale: es }).slice(0, 3)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          <div style={{ position: "relative" }}>
            {/* Today vertical indicator */}
            {(() => {
              const offset = differenceInDays(today, ganttStart);
              if (offset < 0 || offset >= GANTT_DAYS) return null;
              return (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: LEFT_W + offset * DAY_W + DAY_W / 2,
                    width: 1,
                    background: "rgba(99,102,241,0.4)",
                    zIndex: 1,
                    pointerEvents: "none",
                  }}
                />
              );
            })()}

            {dated.length === 0 && (
              <div style={{ padding: 24, color: "#555", fontSize: 13, textAlign: "center" }}>
                Sin tareas con fechas para mostrar.
              </div>
            )}

            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.id);
              const accent = g.id === "__none__" ? "#555" : projectColor(g.name);
              return (
                <div key={g.id}>
                  <div
                    onClick={() => toggleGroup(g.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: "#0c0c0c",
                      borderBottom: "1px solid #1e1e1e",
                      borderTop: "1px solid #1e1e1e",
                      cursor: "pointer",
                      position: "sticky",
                      left: 0,
                      fontSize: 12,
                      color: "#bbb",
                      minWidth: totalWidth,
                    }}
                  >
                    {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent }} />
                    <span style={{ fontWeight: 500 }}>{g.name}</span>
                    <span style={{ color: "#555", fontSize: 11 }}>· {g.tasks.length}</span>
                  </div>
                  {!isCollapsed &&
                    g.tasks.map((t) => (
                      <GanttRow
                        key={t.id}
                        task={t}
                        ganttStart={ganttStart}
                        today={today}
                        dayW={DAY_W}
                        ganttDays={GANTT_DAYS}
                        projName={t.project_id ? projectMap.get(t.project_id) ?? null : null}
                        onOpen={() => onOpen(t)}
                        onPatch={onPatch}
                      />
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div style={{ borderTop: "1px solid #1e1e1e", padding: "12px 16px" }}>
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            Sin fecha asignada
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 100,
                  border: "1px solid #1e1e1e",
                  background: "#0d0d0d",
                  color: "#ccc",
                  cursor: "pointer",
                }}
              >
                {stripMentionSyntaxLoose(t.title)}
                <StatusBadge status={t.status} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          borderTop: "1px solid #1e1e1e",
          padding: "10px 16px",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 11,
          color: "#666",
        }}
      >
        <LegendDot color="#a78bfa" label="En curso" />
        <LegendDot color="#94a3b8" label="Borrador" />
        <LegendDot color="#4ade80" label="Listo" />
        <LegendDot color="#f87171" label="Atrasada" />
      </div>
    </div>
  );
}

function GanttRow({
  task,
  ganttStart,
  today,
  dayW,
  ganttDays,
  projName,
  onOpen,
  onPatch,
}: {
  task: Task;
  ganttStart: Date;
  today: Date;
  dayW: number;
  ganttDays: number;
  projName: string | null;
  onOpen: () => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}) {
  const [dragTx, setDragTx] = useState(0);
  const [resizeDw, setResizeDw] = useState(0);
  const interactionRef = useRef<{ kind: "move" | "resize" | null; startX: number; moved: boolean } | null>(null);

  const startISO = task.start_date ?? task.due_date!;
  const endISO = task.due_date ?? task.start_date!;
  const taskStart = startOfDay(parseISO(startISO));
  const taskEnd = startOfDay(parseISO(endISO));
  const barStartOffset = differenceInDays(taskStart, ganttStart);
  const barDays = Math.max(differenceInDays(taskEnd, taskStart) + 1, 1);
  const barLeft = LEFT_W + barStartOffset * dayW;
  const barWidth = barDays * dayW - 4;

  const overdue = task.status !== "listo" && task.due_date && parseISO(task.due_date) < today;
  const c = overdue
    ? GANTT_COLORS.overdue
    : GANTT_COLORS[(task.status as keyof typeof GANTT_COLORS)] ?? GANTT_COLORS.borrador;

  const onMovePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    interactionRef.current = { kind: "move", startX: e.clientX, moved: false };

    const onMove = (ev: PointerEvent) => {
      const s = interactionRef.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      if (Math.abs(dx) > 4) s.moved = true;
      const snapped = Math.round(dx / dayW) * dayW;
      setDragTx(snapped);
    };
    const onUp = (ev: PointerEvent) => {
      const s = interactionRef.current;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      interactionRef.current = null;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      if (!s.moved || Math.abs(dx) < dayW / 2) {
        setDragTx(0);
        if (!s.moved) onOpen();
        return;
      }
      const deltaDays = Math.round(dx / dayW);
      setDragTx(0);
      if (deltaDays !== 0) {
        const newStart = task.start_date
          ? addDays(parseISO(task.start_date), deltaDays).toISOString()
          : null;
        const newDue = task.due_date
          ? addDays(parseISO(task.due_date), deltaDays).toISOString()
          : null;
        onPatch(task.id, { start_date: newStart, due_date: newDue });
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    interactionRef.current = { kind: "resize", startX: e.clientX, moved: false };

    const onMove = (ev: PointerEvent) => {
      const s = interactionRef.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      if (Math.abs(dx) > 4) s.moved = true;
      const snapped = Math.round(dx / dayW) * dayW;
      // Don't shrink below 1 day
      const maxNeg = -((barDays - 1) * dayW);
      setResizeDw(Math.max(maxNeg, snapped));
    };
    const onUp = (ev: PointerEvent) => {
      const s = interactionRef.current;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      interactionRef.current = null;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      setResizeDw(0);
      if (!s.moved) return;
      const deltaDays = Math.round(dx / dayW);
      const maxNegDays = -(barDays - 1);
      const applied = Math.max(maxNegDays, deltaDays);
      if (applied !== 0) {
        const baseDue = task.due_date ?? task.start_date!;
        const newDue = addDays(parseISO(baseDue), applied).toISOString();
        onPatch(task.id, { due_date: newDue });
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  const clampedLeft = Math.max(barLeft, LEFT_W + 2);
  const widthAdj = Math.max(barWidth - Math.max(0, LEFT_W + 2 - barLeft) + resizeDw, 24);

  return (
    <div
      style={{
        position: "relative",
        height: 36,
        borderBottom: "1px solid #141414",
        display: "flex",
      }}
    >
      <div
        style={{
          width: LEFT_W,
          flexShrink: 0,
          position: "sticky",
          left: 0,
          background: "#0a0a0a",
          zIndex: 4,
          padding: "6px 12px",
          borderRight: "1px solid #1e1e1e",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#ccc",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
          }}
        >
          {stripMentionSyntaxLoose(task.title)}
        </div>
        {projName && (
          <div
            style={{
              fontSize: 10,
              color: "#555",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            {projName}
          </div>
        )}
      </div>

      <div
        onPointerDown={onMovePointerDown}
        title={stripMentionSyntaxLoose(task.title)}
        style={{
          position: "absolute",
          top: 7,
          left: clampedLeft,
          width: widthAdj,
          height: 22,
          borderRadius: 8,
          background: c.bg,
          border: `1px solid ${c.border}`,
          color: c.text,
          fontSize: 11,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "grab",
          zIndex: 2,
          transform: `translateX(${dragTx}px)`,
          transition: interactionRef.current ? "none" : "transform 120ms ease",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{stripMentionSyntaxLoose(task.title)}</span>
        <span
          onPointerDown={onResizePointerDown}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            background: "transparent",
          }}
        />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

/* -------------------- Kanban View -------------------- */

const KANBAN_STATUSES: { id: "borrador" | "en_curso" | "listo" }[] = [
  { id: "borrador" },
  { id: "en_curso" },
  { id: "listo" },
];

function KanbanView({
  tasks,
  onOpen,
  onPatch,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<string, Task[]> = { borrador: [], en_curso: [], listo: [] };
    for (const t of tasks) {
      const k = m[t.status] ? t.status : "borrador";
      m[k].push(t);
    }
    return m;
  }, [tasks]);

  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [overCol, setOverCol] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ task: Task; x: number; y: number; w: number } | null>(null);

  const findCol = (x: number, y: number): string | null => {
    for (const k of Object.keys(columnRefs.current)) {
      const el = columnRefs.current[k];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return k;
    }
    return null;
  };

  const startCardInteraction = (task: Task, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const cardEl = e.currentTarget as HTMLElement;
    const width = cardEl.getBoundingClientRect().width;
    let dragging = false;
    let armed = false;
    const holdTimer = setTimeout(() => {
      armed = true;
      // visual cue applied via state below if user starts moving
    }, 135);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        if (!armed) {
          // moved before hold delay → treat as no-op (cancel)
          cleanup();
          return;
        }
        dragging = true;
        setDrag({ task, x: ev.clientX, y: ev.clientY, w: width });
      }
      if (dragging) {
        setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
        setOverCol(findCol(ev.clientX, ev.clientY));
      }
    };
    const onUp = (ev: PointerEvent) => {
      clearTimeout(holdTimer);
      cleanup();
      if (!dragging) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) onOpen(task);
        return;
      }
      const target = findCol(ev.clientX, ev.clientY);
      setDrag(null);
      setOverCol(null);
      if (target && target !== task.status) {
        onPatch(task.id, { status: target });
      }
    };
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
      }}
    >
      {KANBAN_STATUSES.map((col) => {
        const meta = STATUS_META[col.id];
        const list = grouped[col.id] ?? [];
        const isOver = overCol === col.id;
        return (
          <div
            key={col.id}
            ref={(el) => {
              columnRefs.current[col.id] = el;
            }}
            style={{
              background: "#0a0a0a",
              border: `1px solid ${isOver ? meta.border : "#1e1e1e"}`,
              borderRadius: 12,
              padding: 10,
              minHeight: 200,
              transition: "border-color 120ms ease, background 120ms ease",
              outline: isOver ? `2px solid ${meta.color}55` : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px 10px",
                borderBottom: "1px solid #141414",
                marginBottom: 8,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
              <span style={{ fontSize: 12, color: meta.color, fontWeight: 500 }}>{meta.label}</span>
              <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>{list.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {list.map((t) => {
                const range = formatRange(t.start_date, t.due_date);
                return (
                  <div
                    key={t.id}
                    onPointerDown={(e) => startCardInteraction(t, e)}
                    style={{
                      background: "#0d0d0d",
                      border: "1px solid #1e1e1e",
                      borderRadius: 8,
                      padding: "8px 10px",
                      cursor: "pointer",
                      userSelect: "none",
                      touchAction: "none",
                      opacity: drag?.task.id === t.id ? 0.4 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: "#ddd",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginBottom: 6,
                      }}
                    >
                      {stripMentionSyntaxLoose(t.title)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <PriorityBadge priority={t.priority} />
                      {range && (
                        <span style={{ fontSize: 11, color: "#666" }}>{range}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && (
                <div style={{ fontSize: 12, color: "#444", padding: 12, textAlign: "center" }}>
                  Sin tareas
                </div>
              )}
            </div>
          </div>
        );
      })}

      {drag && (
        <div
          style={{
            position: "fixed",
            top: drag.y - 20,
            left: drag.x - drag.w / 2,
            width: drag.w,
            background: "#161616",
            border: "1px solid #333",
            borderRadius: 8,
            padding: "8px 10px",
            opacity: 0.92,
            transform: "scale(1.03)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            pointerEvents: "none",
            zIndex: 1000,
            fontSize: 13,
            color: "#ddd",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {stripMentionSyntaxLoose(drag.task.title)}
        </div>
      )}
    </div>
  );
}
