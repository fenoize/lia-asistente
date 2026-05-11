import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconX,
  IconAddressBook,
  IconChevronRight,
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/contacts")({
  component: ContactsPage,
});

type Contact = {
  id: string;
  type: "client" | "collaborator";
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  status: "lead" | "active" | "inactive" | null;
  notes: string | null;
  last_activity_at: string | null;
};

type Project = {
  id: string;
  client_id: string | null;
  name: string;
  status: "active" | "paused" | "completed";
  due_date: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  project_id: string | null;
  assigned_to: string | null;
};

const STATUS_LABEL = { lead: "Lead", active: "Activo", inactive: "Inactivo" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function ContactsPage() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [tab, setTab] = useState<"client" | "collaborator">("client");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    if (!user) return;
    const [c, p, t] = await Promise.all([
      supabase.from("contacts").select("*").order("name"),
      supabase.from("projects").select("id,client_id,name,status,due_date"),
      supabase.from("tasks").select("id,title,status,due_date,project_id,assigned_to"),
    ]);
    setContacts((c.data as Contact[]) ?? []);
    setProjects((p.data as Project[]) ?? []);
    setTasks((t.data as TaskRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(
    () =>
      contacts
        .filter((c) => c.type === tab)
        .filter((c) =>
          search.trim()
            ? (c.name + " " + (c.company ?? "") + " " + (c.email ?? ""))
                .toLowerCase()
                .includes(search.toLowerCase())
            : true,
        ),
    [contacts, tab, search],
  );

  const projectsForClient = (id: string) => projects.filter((p) => p.client_id === id);
  const tasksForClient = (id: string) => {
    const projIds = new Set(projectsForClient(id).map((p) => p.id));
    return tasks.filter((t) => t.project_id && projIds.has(t.project_id));
  };
  const tasksForCollaborator = (id: string) =>
    tasks.filter((t) => t.assigned_to === id);

  const openContact = contacts.find((c) => c.id === openId) ?? null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="alfred-h1">Contactos</h1>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Tu CRM personal.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="alfred-new-btn">
          <IconPlus size={14} stroke={2} /> Nuevo contacto
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          {(["client", "collaborator"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "var(--accent-subtle)" : "transparent",
                color: tab === t ? "var(--accent-color)" : "var(--text-secondary)",
                fontWeight: tab === t ? 500 : 400,
                borderRadius: "var(--radius-pill)",
                padding: "6px 14px",
                fontSize: 13,
              }}
            >
              {t === "client" ? "Clientes" : "Colaboradores"}
              <span style={{ marginLeft: 6, color: "var(--text-tertiary)", fontSize: 11 }}>
                {contacts.filter((c) => c.type === t).length}
              </span>
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-2"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            padding: "6px 12px",
            minWidth: 220,
          }}
        >
          <IconSearch size={14} stroke={1.75} color="var(--text-tertiary)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 bg-transparent focus:outline-none"
            style={{ fontSize: 13, color: "var(--text-primary)" }}
          />
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="alfred-skeleton"
              style={{
                height: 96,
                borderRadius: "var(--radius-md)",
              }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState type={tab} assistantName={assistant.name} onAdd={() => setShowNew(true)} />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              projectCount={c.type === "client" ? projectsForClient(c.id).length : 0}
              taskCount={
                c.type === "client"
                  ? tasksForClient(c.id).filter((t) => t.status !== "done").length
                  : tasksForCollaborator(c.id).filter((t) => t.status !== "done").length
              }
              onOpen={() => setOpenId(c.id)}
              onEdit={() => setOpenId(c.id)}
              onDelete={async () => {
                if (!confirm(`¿Borrar a ${c.name}?`)) return;
                setContacts((prev) => prev.filter((x) => x.id !== c.id));
                const { error } = await supabase.from("contacts").delete().eq("id", c.id);
                if (error) {
                  toast.error("No pude borrar.");
                  reload();
                } else toast.success("Borrado.");
              }}
            />
          ))}
        </div>
      )}

      {/* New contact modal */}
      {showNew && (
        <NewContactModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            reload();
          }}
          userId={user?.id ?? ""}
        />
      )}

      {/* Detail panel */}
      {openContact && (
        <ContactPanel
          contact={openContact}
          projects={projectsForClient(openContact.id)}
          tasks={
            openContact.type === "client"
              ? tasksForClient(openContact.id)
              : tasksForCollaborator(openContact.id)
          }
          allContacts={contacts}
          onClose={() => setOpenId(null)}
          onChange={reload}
        />
      )}
    </div>
  );
}

function ContactCard({
  contact,
  projectCount,
  taskCount,
  onOpen,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  projectCount: number;
  taskCount: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const statusColor =
    contact.status === "active"
      ? { bg: "oklch(0.5 0.15 145 / 18%)", color: "oklch(0.78 0.16 145)" }
      : contact.status === "lead"
        ? { bg: "oklch(0.55 0.15 75 / 18%)", color: "oklch(0.82 0.15 80)" }
        : { bg: "transparent", color: "var(--text-tertiary)" };

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${hover ? "var(--accent-subtle)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        padding: 16,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 32,
            height: 32,
            background: "var(--accent-subtle)",
            color: "var(--accent-color)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {initials(contact.name)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>
          {contact.name}
        </div>
        {contact.type === "client" && contact.status && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: statusColor.bg,
              color: statusColor.color,
              border:
                contact.status === "inactive" ? "1px solid var(--border)" : "none",
              fontWeight: 500,
            }}
          >
            {STATUS_LABEL[contact.status]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3" style={{ fontSize: 13, marginLeft: 44 }}>
        <span style={{ color: "var(--text-secondary)" }}>
          {contact.type === "client" ? contact.company || "—" : contact.role || "—"}
        </span>
        {contact.email && (
          <span style={{ color: "var(--text-tertiary)" }}>· {contact.email}</span>
        )}
      </div>
      <div className="flex items-center justify-between mt-3" style={{ marginLeft: 44 }}>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {contact.type === "client"
            ? `${projectCount} proyecto${projectCount === 1 ? "" : "s"} · ${taskCount} tarea${taskCount === 1 ? "" : "s"} pendiente${taskCount === 1 ? "" : "s"}`
            : `${taskCount} tarea${taskCount === 1 ? "" : "s"} asignada${taskCount === 1 ? "" : "s"}`}
        </div>
        <div className="flex items-center gap-2" style={{ opacity: hover ? 1 : 0, transition: "opacity 0.15s" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Editar"
            style={{ color: "var(--text-tertiary)", padding: 4 }}
          >
            <IconPencil size={14} stroke={1.75} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Borrar"
            style={{ color: "var(--text-tertiary)", padding: 4 }}
          >
            <IconTrash size={14} stroke={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  type,
  assistantName,
  onAdd,
}: {
  type: "client" | "collaborator";
  assistantName: string;
  onAdd: () => void;
}) {
  return (
    <div
      className="text-center"
      style={{
        padding: "60px 24px",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <IconAddressBook
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
        {type === "client"
          ? `Aún no tienes clientes registrados. Agrega tu primer cliente para que ${assistantName} tenga contexto de tus proyectos.`
          : "Sin colaboradores aún. Agrega a quienes te ayudan a ejecutar."}
      </p>
      <button
        onClick={onAdd}
        style={{
          background: "var(--accent-color)",
          color: "white",
          borderRadius: "var(--radius-pill)",
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Agregar {type === "client" ? "cliente" : "colaborador"}
      </button>
    </div>
  );
}

function NewContactModal({
  onClose,
  onSaved,
  userId,
}: {
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const [type, setType] = useState<"client" | "collaborator">("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [companyOrRole, setCompanyOrRole] = useState("");
  const [status, setStatus] = useState<"lead" | "active" | "inactive">("active");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !userId) return;
    setBusy(true);
    const payload: any = {
      user_id: userId,
      type,
      name: name.trim(),
      email: email.trim() || null,
      notes: notes.trim() || null,
    };
    if (type === "client") {
      payload.company = companyOrRole.trim() || null;
      payload.status = status;
    } else {
      payload.role = companyOrRole.trim() || null;
    }
    const { error } = await supabase.from("contacts").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Guardado ✓");
    onSaved();
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
          width: 480,
          maxWidth: "100%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 20,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)" }}>
            Nuevo contacto
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "var(--text-tertiary)" }}>
            <IconX size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {(["client", "collaborator"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                background: type === t ? "var(--accent-subtle)" : "transparent",
                color: type === t ? "var(--accent-color)" : "var(--text-secondary)",
                border: `1px solid ${type === t ? "var(--accent-color)" : "var(--border)"}`,
                borderRadius: "var(--radius-pill)",
                padding: "5px 12px",
                fontSize: 12,
              }}
            >
              {t === "client" ? "Cliente" : "Colaborador"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <Field label="Nombre">
            <BareInput value={name} onChange={setName} placeholder="Nombre completo" autoFocus />
          </Field>
          <Field label="Email">
            <BareInput value={email} onChange={setEmail} placeholder="email@ejemplo.com" />
          </Field>
          <Field label={type === "client" ? "Empresa" : "Rol"}>
            <BareInput
              value={companyOrRole}
              onChange={setCompanyOrRole}
              placeholder={type === "client" ? "Acme Inc." : "Diseñador, dev, etc."}
            />
          </Field>
          {type === "client" && (
            <Field label="Estado">
              <div className="flex items-center gap-2">
                {(["lead", "active", "inactive"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    style={{
                      background: status === s ? "var(--accent-subtle)" : "transparent",
                      color: status === s ? "var(--accent-color)" : "var(--text-secondary)",
                      border: `1px solid ${status === s ? "var(--accent-color)" : "var(--border)"}`,
                      borderRadius: "var(--radius-pill)",
                      padding: "4px 12px",
                      fontSize: 12,
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas internas..."
              className="w-full bg-transparent focus:outline-none resize-none"
              style={{
                fontSize: 13,
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              padding: "7px 14px",
            }}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function BareInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent focus:outline-none"
      style={{
        fontSize: 14,
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "8px 12px",
      }}
    />
  );
}

function ContactPanel({
  contact,
  projects,
  tasks,
  allContacts,
  onClose,
  onChange,
}: {
  contact: Contact;
  projects: Project[];
  tasks: TaskRow[];
  allContacts: Contact[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<"projects" | "tasks" | "info">(
    contact.type === "client" ? "projects" : "tasks",
  );
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(contact);

  useEffect(() => {
    setForm(contact);
    setEditing(false);
    setTab(contact.type === "client" ? "projects" : "tasks");
  }, [contact.id, contact.type]);

  const saveInfo = async () => {
    const { error } = await supabase
      .from("contacts")
      .update({
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        role: form.role,
        notes: form.notes,
      })
      .eq("id", contact.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Guardado ✓");
      setEditing(false);
      onChange();
    }
  };

  const tabs: { key: typeof tab; label: string }[] =
    contact.type === "client"
      ? [
          { key: "projects", label: "Proyectos" },
          { key: "tasks", label: "Tareas" },
          { key: "info", label: "Info" },
        ]
      : [
          { key: "tasks", label: "Tareas asignadas" },
          { key: "info", label: "Info" },
        ];

  const tasksByProject = useMemo(() => {
    const map = new Map<string, { name: string; tasks: TaskRow[] }>();
    for (const t of tasks) {
      const proj = projects.find((p) => p.id === t.project_id) ?? null;
      const key = proj?.id ?? "_none";
      const name = proj?.name ?? "Sin proyecto";
      if (!map.has(key)) map.set(key, { name, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [tasks, projects]);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 h-screen z-50 overflow-y-auto scrollbar-thin"
        style={{
          width: 360,
          maxWidth: "100%",
          background: "var(--bg-base)",
          borderLeft: "1px solid var(--border)",
          animation: "alfredPanelIn 200ms ease both",
        }}
      >
        <style>{`
          @keyframes alfredPanelIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `}</style>

        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                background: "var(--accent-subtle)",
                color: "var(--accent-color)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {initials(contact.name)}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>
                {contact.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {contact.type === "client"
                  ? contact.company || "Cliente"
                  : contact.role || "Colaborador"}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "var(--text-tertiary)" }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 mt-5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: "var(--radius-pill)",
                background: tab === t.key ? "var(--accent-subtle)" : "transparent",
                color: tab === t.key ? "var(--accent-color)" : "var(--text-secondary)",
                fontWeight: tab === t.key ? 500 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">
          {tab === "projects" && (
            <ProjectsTab
              clientId={contact.id}
              projects={projects}
              tasks={tasks}
              onChange={onChange}
            />
          )}
          {tab === "tasks" && (
            <div className="space-y-4">
              {tasksByProject.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                  Sin tareas vinculadas.
                </p>
              ) : (
                tasksByProject.map((g) => (
                  <div key={g.name}>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--text-tertiary)",
                        fontWeight: 500,
                        marginBottom: 8,
                      }}
                    >
                      {g.name}
                    </div>
                    <div className="space-y-1.5">
                      {g.tasks.map((t) => (
                        <TaskRowSmall key={t.id} task={t} contacts={allContacts} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === "info" && (
            <div className="space-y-3">
              <InfoField
                label="Email"
                value={form.email ?? ""}
                editing={editing}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <InfoField
                label="Teléfono"
                value={form.phone ?? ""}
                editing={editing}
                onChange={(v) => setForm({ ...form, phone: v })}
              />
              {contact.type === "client" ? (
                <InfoField
                  label="Empresa"
                  value={form.company ?? ""}
                  editing={editing}
                  onChange={(v) => setForm({ ...form, company: v })}
                />
              ) : (
                <InfoField
                  label="Rol"
                  value={form.role ?? ""}
                  editing={editing}
                  onChange={(v) => setForm({ ...form, role: v })}
                />
              )}
              <InfoField
                label="Notas"
                value={form.notes ?? ""}
                editing={editing}
                multiline
                onChange={(v) => setForm({ ...form, notes: v })}
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => {
                        setForm(contact);
                        setEditing(false);
                      }}
                      style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "5px 10px" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveInfo}
                      style={{
                        background: "var(--accent-color)",
                        color: "white",
                        borderRadius: "var(--radius-pill)",
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Guardar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      background: "transparent",
                      color: "var(--accent-color)",
                      border: "1px solid var(--accent-color)",
                      borderRadius: "var(--radius-pill)",
                      padding: "5px 14px",
                      fontSize: 12,
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function InfoField({
  label,
  value,
  editing,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      {editing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full bg-transparent focus:outline-none resize-none"
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
            }}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent focus:outline-none"
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
            }}
          />
        )
      ) : (
        <p
          className="whitespace-pre-line"
          style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}
        >
          {value || <span style={{ color: "var(--text-tertiary)" }}>—</span>}
        </p>
      )}
    </div>
  );
}

function ProjectsTab({
  clientId,
  projects,
  tasks,
  onChange,
}: {
  clientId: string;
  projects: Project[];
  tasks: TaskRow[];
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const { user } = useAuth();

  const createProject = async () => {
    if (!name.trim() || !user) return;
    const { error } = await supabase.from("projects").insert({
      user_id: user.id,
      client_id: clientId,
      name: name.trim(),
      status: "active",
    });
    if (error) toast.error(error.message);
    else {
      setName("");
      setCreating(false);
      toast.success("Proyecto creado.");
      onChange();
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-3">
      {projects.length === 0 && !creating && (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Sin proyectos aún.</p>
      )}
      {projects.map((p) => {
        const projTasks = tasks.filter((t) => t.project_id === p.id);
        const done = projTasks.filter((t) => t.status === "done").length;
        const total = projTasks.length;
        const overdue = p.due_date && new Date(p.due_date) < today;
        const pct = total ? (done / total) * 100 : 0;
        return (
          <div
            key={p.id}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 12,
            }}
          >
            <div className="flex items-center justify-between">
              <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{p.name}</div>
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 8px",
                  borderRadius: "var(--radius-pill)",
                  background:
                    p.status === "active"
                      ? "var(--accent-subtle)"
                      : "transparent",
                  border:
                    p.status === "active" ? "none" : "1px solid var(--border)",
                  color:
                    p.status === "active"
                      ? "var(--accent-color)"
                      : "var(--text-tertiary)",
                }}
              >
                {p.status === "active" ? "Activo" : p.status === "paused" ? "Pausa" : "Done"}
              </span>
            </div>
            {p.due_date && (
              <div
                style={{
                  fontSize: 12,
                  color: overdue ? "oklch(0.7 0.2 25)" : "var(--text-tertiary)",
                  marginTop: 4,
                }}
              >
                {new Date(p.due_date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              {done}/{total} tareas completadas
            </div>
            <div
              style={{
                marginTop: 4,
                height: 3,
                background: "var(--border)",
                borderRadius: 4,
                overflow: "hidden",
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
          </div>
        );
      })}

      {creating ? (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            placeholder="Nombre del proyecto"
            className="flex-1 bg-transparent focus:outline-none"
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
            }}
          />
          <button
            onClick={createProject}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "5px 12px",
              fontSize: 12,
            }}
          >
            Crear
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1"
          style={{
            fontSize: 12,
            color: "var(--accent-color)",
            padding: "6px 0",
          }}
        >
          <IconPlus size={12} stroke={2} /> Nuevo proyecto
        </button>
      )}
    </div>
  );
}

function TaskRowSmall({ task, contacts }: { task: TaskRow; contacts: Contact[] }) {
  const assignee = contacts.find((c) => c.id === task.assigned_to);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue =
    task.status !== "done" && task.due_date && new Date(task.due_date) < today;
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "6px 10px",
      }}
    >
      <span
        style={{
          fontSize: 13,
          flex: 1,
          color: task.status === "done" ? "var(--text-tertiary)" : "var(--text-primary)",
          textDecoration: task.status === "done" ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>
      {assignee && (
        <span
          className="rounded-full flex items-center justify-center"
          style={{
            width: 18,
            height: 18,
            background: "var(--accent-subtle)",
            color: "var(--accent-color)",
            fontSize: 9,
            fontWeight: 500,
          }}
        >
          {initials(assignee.name)}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          padding: "1px 7px",
          borderRadius: "var(--radius-pill)",
          background:
            task.status === "done"
              ? "transparent"
              : overdue
                ? "oklch(0.5 0.15 25 / 18%)"
                : "var(--accent-subtle)",
          color:
            task.status === "done"
              ? "var(--text-tertiary)"
              : overdue
                ? "oklch(0.78 0.16 25)"
                : "var(--accent-color)",
          border: task.status === "done" ? "1px solid var(--border)" : "none",
        }}
      >
        {task.status === "done" ? "Hecha" : overdue ? "Vencida" : "Pendiente"}
      </span>
      <IconChevronRight size={12} color="var(--text-tertiary)" />
    </div>
  );
}
