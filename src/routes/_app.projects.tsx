import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconBriefcase, IconPlus } from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
};

type Contact = { id: string; name: string; type: string };
type TaskRow = {
  id: string;
  status: string;
  project_id: string | null;
  assigned_to: string | null;
};

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "?") + (p[1]?.[0] ?? "")).toUpperCase();
}

const GROUPS: { key: Project["status"]; label: string }[] = [
  { key: "active", label: "Activos" },
  { key: "paused", label: "En pausa" },
  { key: "completed", label: "Completados" },
];

function ProjectsPage() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [projects, setProjects] = useState<Project[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    if (!user) return;
    const [p, c, t] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id,name,type"),
      supabase.from("tasks").select("id,status,project_id,assigned_to"),
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

  const grouped = useMemo(() => {
    const m: Record<Project["status"], Project[]> = { active: [], paused: [], completed: [] };
    for (const p of projects) m[p.status]?.push(p);
    return m;
  }, [projects]);

  return (
    <div className="mx-auto" style={{ maxWidth: 880, padding: "40px 24px" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            Proyectos
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>
            Tu trabajo, organizado por cliente.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            border: "1px solid var(--accent-color)",
            color: "var(--accent-color)",
            background: "transparent",
            borderRadius: "var(--radius-pill)",
            padding: "7px 14px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <IconPlus size={14} stroke={2} /> Nuevo proyecto
        </button>
      </div>

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
      ) : (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const list = grouped[g.key];
            if (list.length === 0) return null;
            return (
              <section key={g.key}>
                <div
                  className="mb-3"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--text-tertiary)",
                    fontWeight: 500,
                  }}
                >
                  {g.label} · {list.length}
                </div>
                <div className="space-y-3">
                  {list.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      contacts={contacts}
                      tasks={tasks}
                    />
                  ))}
                </div>
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
    </div>
  );
}

function ProjectCard({
  project,
  contacts,
  tasks,
}: {
  project: Project;
  contacts: Contact[];
  tasks: TaskRow[];
}) {
  const client = contacts.find((c) => c.id === project.client_id);
  const projTasks = tasks.filter((t) => t.project_id === project.id);
  const done = projTasks.filter((t) => t.status === "done").length;
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
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
      }}
    >
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
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !userId) return;
    setBusy(true);
    const { error } = await supabase.from("projects").insert({
      user_id: userId,
      name: name.trim(),
      client_id: clientId || null,
      due_date: dueDate || null,
      status: "active",
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
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
              colorScheme: "dark",
            }}
          />
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
