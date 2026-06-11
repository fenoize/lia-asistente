import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconBriefcase, IconPlus, IconPencil, IconTrash, IconSearch, IconUser, IconCalendar, IconChevronDown } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EditProjectModal } from "@/components/projects/edit-project-modal";
import { EditTaskModal, type EditableTask } from "@/components/tasks/edit-task-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
});

type Project = {
  id: string;
  client_id: string | null;
  name: string;
  status: "active" | "paused" | "completed";
  due_date: string | null;
  budget: number | null;
  notes: string | null;
};

type Contact = { id: string; name: string; type: string };
type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
};

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

const PROJECT_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899","#8b5cf6","#14b8a6","#f97316"];
function projectColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

function isOverdue(t: TaskRow) {
  if (!t.due_date || t.status === "listo") return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(t.due_date) < today;
}

const GROUPS: { key: Project["status"]; label: string }[] = [
  { key: "active", label: "Activos" },
  { key: "paused", label: "En pausa" },
  { key: "completed", label: "Completados" },
];

type FilterKey = "all" | "active" | "paused" | "completed" | "overdue";

function ProjectsPage() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const [openProject, setOpenProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAllCompleted, setShowAllCompleted] = useState(false);

  const reload = async () => {
    if (!user) return;
    const [p, c, t] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id,name,type"),
      supabase.from("tasks").select("id,title,status,priority,due_date,start_date,description,project_id,assigned_to"),
    ]);
    setProjects((p.data as Project[]) ?? []);
    setContacts((c.data as Contact[]) ?? []);
    setTasks((t.data as TaskRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const overdueByProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tasks) {
      if (!t.project_id || !isOverdue(t)) continue;
      m[t.project_id] = (m[t.project_id] ?? 0) + 1;
    }
    return m;
  }, [tasks]);

  const filteredByQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  const counts = useMemo(() => ({
    all: filteredByQuery.length,
    active: filteredByQuery.filter((p) => p.status === "active").length,
    paused: filteredByQuery.filter((p) => p.status === "paused").length,
    completed: filteredByQuery.filter((p) => p.status === "completed").length,
    overdue: filteredByQuery.filter((p) => (overdueByProject[p.id] ?? 0) > 0).length,
  }), [filteredByQuery, overdueByProject]);

  const grouped = useMemo(() => {
    const m: Record<Project["status"], Project[]> = { active: [], paused: [], completed: [] };
    for (const p of filteredByQuery) m[p.status]?.push(p);
    return m;
  }, [filteredByQuery]);

  const flatFiltered = useMemo(() => {
    if (filter === "all") return [];
    if (filter === "overdue") return filteredByQuery.filter((p) => (overdueByProject[p.id] ?? 0) > 0);
    return filteredByQuery.filter((p) => p.status === filter);
  }, [filter, filteredByQuery, overdueByProject]);

  const FILTERS: { key: FilterKey; label: string; count: number; danger?: boolean }[] = [
    { key: "all", label: "Todos", count: counts.all },
    { key: "active", label: "Activos", count: counts.active },
    { key: "paused", label: "En pausa", count: counts.paused },
    { key: "completed", label: "Completados", count: counts.completed },
    { key: "overdue", label: "Con atrasos", count: counts.overdue, danger: true },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="alfred-h1">Proyectos</h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Tu trabajo, organizado por cliente.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="alfred-new-btn">
          <IconPlus size={14} stroke={2} /> Nuevo proyecto
        </button>
      </div>

      {!loading && projects.length > 0 && (
        <>
          <div
            className="flex items-center gap-2 mb-3"
            style={{
              background: "#0e0e0e",
              border: "1px solid #1a1a1a",
              borderRadius: 100,
              padding: "8px 14px",
            }}
          >
            <IconSearch size={15} color="var(--text-tertiary)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto…"
              className="flex-1 bg-transparent focus:outline-none"
              style={{ fontSize: 13, color: "var(--text-primary)" }}
            />
          </div>

          <style>{`.lia-proj-filters::-webkit-scrollbar{display:none}`}</style>
          <div
            className="lia-proj-filters flex items-center gap-2 mb-5"
            style={{ overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    flex: "0 0 auto",
                    fontSize: 12,
                    padding: "6px 12px",
                    borderRadius: 100,
                    border: active
                      ? "1px solid #6366f1"
                      : `1px solid ${f.danger ? "#3a1a1a" : "#1a1a1a"}`,
                    background: active
                      ? "rgba(99,102,241,0.15)"
                      : f.danger ? "#1a0a0a" : "transparent",
                    color: active
                      ? "#818cf8"
                      : f.danger ? "#f87171" : "var(--text-tertiary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.label} · {f.count}
                </button>
              );
            })}
          </div>
        </>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="alfred-skeleton"
              style={{ height: 110, borderRadius: "var(--radius-md)" }}
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div
          className="text-center"
          style={{
            padding: "60px 24px",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <IconBriefcase
            size={28}
            stroke={1.5}
            color="var(--text-tertiary)"
            style={{ margin: "0 auto 12px" }}
          />
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              maxWidth: 360,
              margin: "0 auto 16px",
              lineHeight: 1.5,
            }}
          >
            Aún no tienes proyectos. Crea uno y vincúlalo a un cliente para que {assistant.name} pueda darte contexto real.
          </p>
          <button
            onClick={() => setShowNew(true)}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Crear proyecto
          </button>
        </div>
      ) : filter !== "all" ? (
        flatFiltered.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "24px 0", textAlign: "center" }}>
            Sin proyectos para este filtro.
          </div>
        ) : (
          <div className="space-y-3">
            {flatFiltered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                contacts={contacts}
                tasks={tasks}
                overdueCount={overdueByProject[p.id] ?? 0}
                onOpen={() => setOpenProject(p)}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const list = grouped[g.key];
            if (list.length === 0) return null;
            const isCompleted = g.key === "completed";
            const visible = isCompleted && !showAllCompleted && list.length > 3 ? list.slice(0, 3) : list;
            return (
              <section key={g.key}>
                <div className="alfred-section-label">
                  {g.label} · {list.length}
                </div>
                <div className="space-y-3">
                  {visible.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      contacts={contacts}
                      tasks={tasks}
                      overdueCount={overdueByProject[p.id] ?? 0}
                      onOpen={() => setOpenProject(p)}
                      onEdit={() => setEditing(p)}
                      onDelete={() => setDeleting(p)}
                    />
                  ))}
                </div>
                {isCompleted && list.length > 3 && (
                  <button
                    onClick={() => setShowAllCompleted((v) => !v)}
                    className="flex items-center gap-1 mt-3"
                    style={{ fontSize: 12, color: "var(--text-tertiary)" }}
                  >
                    <IconChevronDown
                      size={14}
                      style={{ transform: showAllCompleted ? "rotate(180deg)" : "none", transition: "transform .2s" }}
                    />
                    {showAllCompleted ? "Mostrar menos" : `Ver ${list.length - 3} más`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          contacts={contacts}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            reload();
          }}
          userId={user?.id ?? ""}
        />
      )}

      {openProject && (
        <ProjectDetailModal
          project={openProject}
          contacts={contacts}
          tasks={tasks}
          projects={projects}
          onClose={() => setOpenProject(null)}
          onChanged={reload}
        />
      )}

      {editing && (
        <EditProjectModal
          project={editing}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. "{deleting?.name}" se eliminará permanentemente.
              Las tareas vinculadas no se borran, sólo se desvinculan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                const id = deleting.id;
                setDeleting(null);
                const { error } = await supabase.from("projects").delete().eq("id", id);
                if (error) toast.error(error.message);
                else {
                  toast.success("Eliminado");
                  reload();
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectCard({
  project,
  contacts,
  tasks,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  contacts: Contact[];
  tasks: TaskRow[];
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const client = contacts.find((c) => c.id === project.client_id);
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const done = projTasks.filter((t) => t.status === "listo").length;
  const total = projTasks.length;
  const pct = total ? (done / total) * 100 : 0;
  const collabs = Array.from(
    new Set(projTasks.map((t) => t.assigned_to).filter((x): x is string => !!x)),
  )
    .map((id) => contacts.find((c) => c.id === id))
    .filter((c): c is Contact => !!c)
    .slice(0, 3);

  return (
    <div
      onClick={onOpen}
      className="group relative"
      style={{
        background: "#0e0e0e",
        border: "1px solid #141414",
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
      }}
    >
      <div
        className="absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ top: 10, right: 10 }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label="Editar"
          style={{ color: "var(--text-tertiary)", padding: 4 }}
        >
          <IconPencil size={14} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Eliminar"
          style={{ color: "var(--text-tertiary)", padding: 4 }}
        >
          <IconTrash size={14} />
        </button>
      </div>
      {client && (
        <div className="flex items-center gap-2 mb-2">
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: 20,
              height: 20,
              background: "var(--accent-subtle)",
              color: "var(--accent-color)",
              fontSize: 9,
              fontWeight: 500,
            }}
          >
            {initials(client.name)}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{client.name}</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>
          {project.name}
        </div>
        <span
          style={{
            fontSize: 10,
            padding: "1px 8px",
            borderRadius: "var(--radius-pill)",
            background:
              project.status === "active" ? "var(--accent-subtle)" : "transparent",
            border:
              project.status === "active" ? "none" : "1px solid var(--border)",
            color:
              project.status === "active"
                ? "var(--accent-color)"
                : "var(--text-tertiary)",
          }}
        >
          {project.status === "active"
            ? "Activo"
            : project.status === "paused"
              ? "En pausa"
              : "Completado"}
        </span>
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
        {project.due_date && (
          <span>
            {new Date(project.due_date).toLocaleDateString("es-CL", {
              day: "numeric",
              month: "short",
            })}
          </span>
        )}
        {project.budget != null && <span>· ${project.budget.toLocaleString("es-CL")}</span>}
      </div>
      <div
        style={{
          height: 3,
          background: "var(--border)",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--accent-color)",
            transition: "width 0.3s",
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          {done}/{total} tareas
        </div>
        {collabs.length > 0 && (
          <div className="flex -space-x-1.5">
            {collabs.map((c) => (
              <span
                key={c.id}
                title={c.name}
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 20,
                  height: 20,
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: 9,
                  fontWeight: 500,
                }}
              >
                {initials(c.name)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewProjectModal({
  contacts,
  userId,
  onClose,
  onSaved,
}: {
  contacts: Contact[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const clients = contacts.filter((c) => c.type === "client");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<"CLP" | "USD">("CLP");
  const [status, setStatus] = useState<"active" | "paused" | "completed">("active");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !userId) return;
    setBusy(true);
    const budgetNum = budget.trim() ? Number(budget.replace(/[^\d.-]/g, "")) : null;
    const noteParts: string[] = [];
    if (description.trim()) noteParts.push(description.trim());
    if (budgetNum != null) noteParts.push(`[currency:${currency}]`);
    const { error } = await supabase.from("projects").insert({
      user_id: userId,
      name: name.trim(),
      client_id: clientId || null,
      due_date: dueDate || null,
      budget: budgetNum,
      notes: noteParts.length ? noteParts.join("\n\n") : null,
      status,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Creado ✓");
      onSaved();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginBottom: 16 }}>
          Nuevo proyecto
        </h2>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Nombre del proyecto"
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          />
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full focus:outline-none"
            style={{
              fontSize: 14,
              color: clientId ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          >
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={3}
            className="w-full bg-transparent focus:outline-none resize-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 14,
              color: dueDate ? "var(--text-primary)" : "var(--text-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              colorScheme: "dark",
            }}
          />
          <div className="flex gap-2">
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Presupuesto"
              inputMode="decimal"
              className="flex-1 bg-transparent focus:outline-none"
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "CLP" | "USD")}
              className="focus:outline-none"
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full focus:outline-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}
          >
            <option value="active">Activo</option>
            <option value="paused">En pausa</option>
            <option value="completed">Completado</option>
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "7px 14px" }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: 500,
              opacity: busy || !name.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectDetailModal({
  project,
  contacts,
  tasks,
  projects,
  onClose,
  onChanged,
}: {
  project: Project;
  contacts: Contact[];
  tasks: TaskRow[];
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const client = contacts.find((c) => c.id === project.client_id);
  const linked = tasks.filter((t) => t.project_id === project.id);
  const unassigned = tasks.filter((t) => t.project_id == null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null);
  const filtered = unassigned.filter((t) =>
    t.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const link = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ project_id: project.id })
      .eq("id", taskId);
    if (error) toast.error(error.message);
    else {
      toast.success("Vinculada ✓");
      setShowAdd(false);
      setSearch("");
      onChanged();
    }
  };

  const unlink = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({ project_id: null })
      .eq("id", taskId);
    if (error) toast.error(error.message);
    else onChanged();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          {client && (
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
              {client.name}
            </div>
          )}
          <div style={{ fontSize: 18, fontWeight: 500, color: "#eaeaea" }}>
            {project.name}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {linked.length} {linked.length === 1 ? "tarea" : "tareas"}
          </div>
        </div>

        <div className="alfred-section-label" style={{ marginBottom: 8 }}>
          TAREAS DEL PROYECTO
        </div>

        {linked.length === 0 ? (
          <div style={{ fontSize: 13, color: "#555", padding: "12px 0 16px" }}>
            Aún no hay tareas vinculadas.
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
            {linked.map((t) => (
              <li
                key={t.id}
                className="group flex items-center gap-3 cursor-pointer"
                style={{ padding: "8px 10px", borderRadius: 8, background: "#0d0d0d" }}
                onClick={() => setEditingTask({
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  priority: t.priority,
                  status: t.status,
                  start_date: t.start_date,
                  due_date: t.due_date,
                  project_id: t.project_id,
                })}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: t.status === "listo" ? "var(--accent-color)" : "#444",
                    flexShrink: 0,
                  }}
                />
                <span
                  className="flex-1 truncate"
                  style={{
                    fontSize: 13,
                    color: t.status === "listo" ? "#444" : "#ccc",
                    textDecoration: t.status === "listo" ? "line-through" : "none",
                  }}
                >
                  {t.title}
                </span>
                {t.due_date && (
                  <span style={{ fontSize: 11, color: "#555" }}>
                    {new Date(t.due_date).toLocaleDateString("es-CL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); unlink(t.id); }}
                  className="opacity-0 group-hover:opacity-100"
                  style={{ fontSize: 11, color: "#666", padding: "2px 8px" }}
                  title="Desvincular"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              fontSize: 12,
              color: "#818cf8",
              padding: "6px 0",
              background: "transparent",
            }}
          >
            + Agregar tarea existente
          </button>
        ) : (
          <div style={{ marginTop: 8 }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarea sin proyecto..."
              className="w-full focus:outline-none"
              style={{
                fontSize: 13,
                color: "#eaeaea",
                background: "#0d0d0d",
                border: "1px solid #1e1e1e",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 6,
              }}
            />
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                background: "#0d0d0d",
                border: "1px solid #1e1e1e",
                borderRadius: 8,
              }}
            >
              {filtered.length === 0 ? (
                <div style={{ fontSize: 12, color: "#555", padding: 12 }}>
                  No hay tareas sin proyecto.
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => link(t.id)}
                    className="w-full text-left"
                    style={{
                      fontSize: 13,
                      color: "#ccc",
                      padding: "8px 12px",
                      borderBottom: "1px solid #161616",
                      background: "transparent",
                    }}
                  >
                    {t.title}
                  </button>
                ))
              )}
            </div>
            <div className="flex justify-end mt-2">
              <button
                onClick={() => { setShowAdd(false); setSearch(""); }}
                style={{ fontSize: 12, color: "#666", padding: "4px 10px" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              color: "#555",
              border: "1px solid #1e1e1e",
              borderRadius: 100,
              padding: "7px 16px",
              background: "transparent",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); onChanged(); }}
          onDeleted={() => { setEditingTask(null); onChanged(); }}
        />
      )}
    </div>
  );
}
