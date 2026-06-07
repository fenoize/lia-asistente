import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconX,
  IconAddressBook,
  IconChevronDown,
  IconChevronUp,
  IconCake,
  IconLink,
  IconMapPin,
} from "@tabler/icons-react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/contacts")({
  component: ContactsPage,
});

type RelType = "client" | "collaborator" | "friend" | "family" | "partner" | "other";

const REL_TYPES: { id: RelType; label: string }[] = [
  { id: "client", label: "Cliente" },
  { id: "collaborator", label: "Colaborador" },
  { id: "friend", label: "Amigo" },
  { id: "family", label: "Familiar" },
  { id: "partner", label: "Pareja" },
  { id: "other", label: "Otro" },
];
const REL_LABEL: Record<RelType, string> = Object.fromEntries(
  REL_TYPES.map((r) => [r.id, r.label]),
) as Record<RelType, string>;

const WORK_TYPES: RelType[] = ["client", "collaborator"];

/* Multi-tag system: a contact can have multiple labels simultaneously. */
const TAG_OPTIONS = [
  "Cliente",
  "Proveedor",
  "Colaborador",
  "Amigo",
  "Familia",
  "Otro",
] as const;
type TagOption = (typeof TAG_OPTIONS)[number];

const TAG_TO_REL: Record<TagOption, RelType> = {
  Cliente: "client",
  Proveedor: "collaborator",
  Colaborador: "collaborator",
  Amigo: "friend",
  Familia: "family",
  Otro: "other",
};

function relTypeFromTags(tags: string[] | null | undefined, fallback: RelType): RelType {
  if (!tags || tags.length === 0) return fallback;
  if (tags.includes("Cliente")) return "client";
  for (const t of tags) {
    if ((TAG_OPTIONS as readonly string[]).includes(t)) return TAG_TO_REL[t as TagOption];
  }
  return fallback;
}

const TAG_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  Cliente:     { bg: "rgba(16,185,129,0.10)", fg: "#34d399", border: "rgba(16,185,129,0.25)" },
  Proveedor:   { bg: "rgba(245,158,11,0.10)", fg: "#fbbf24", border: "rgba(245,158,11,0.25)" },
  Colaborador: { bg: "rgba(99,102,241,0.12)", fg: "#818cf8", border: "rgba(99,102,241,0.28)" },
  Amigo:       { bg: "rgba(236,72,153,0.10)", fg: "#f472b6", border: "rgba(236,72,153,0.25)" },
  Familia:     { bg: "rgba(168,85,247,0.10)", fg: "#c084fc", border: "rgba(168,85,247,0.25)" },
  Otro:        { bg: "rgba(120,120,120,0.10)", fg: "#9ca3af", border: "rgba(120,120,120,0.25)" },
};
function tagStyle(tag: string) {
  return TAG_COLORS[tag] ?? TAG_COLORS.Otro;
}

type Contact = {
  id: string;
  type: "client" | "collaborator";
  relationship_type: RelType;
  tags: string[] | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  status: "lead" | "active" | "inactive" | null;
  notes: string | null;
  context: string | null;
  birthday: string | null;
  address: string | null;
  custom_fields: Record<string, string> | null;
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

type Meeting = {
  id: string;
  title: string;
  datetime: string;
};

type Relation = {
  id: string;
  contact_a: string;
  contact_b: string;
  relation_label: string;
  shared_context: string | null;
};

const STATUS_LABEL = { lead: "Lead", active: "Activo", inactive: "Inactivo" } as const;

const CUSTOM_FIELD_SUGGESTIONS = ["Hijos", "Mascotas", "Pareja", "Trabajo", "Intereses"];
const RELATION_SUGGESTIONS = [
  "esposo/a",
  "pareja",
  "amigo/a",
  "hermano/a",
  "socio/a",
  "colega",
  "familiar",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function formatBirthday(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${d} de ${months[m - 1]}`;
}

function daysUntilBirthday(iso: string | null): number | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  const now = new Date();
  const year = now.getFullYear();
  let next = new Date(year, m - 1, d);
  const today = new Date(year, now.getMonth(), now.getDate());
  if (next < today) next = new Date(year + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

function ContactsPage() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [tab, setTab] = useState<"client" | "collaborator">("client");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    if (!user) return;
    const [c, p, t, m, r] = await Promise.all([
      supabase.from("contacts").select("*").order("name"),
      supabase.from("projects").select("id,client_id,name,status,due_date"),
      supabase.from("tasks").select("id,title,status,due_date,project_id,assigned_to"),
      supabase.from("meetings").select("id,title,datetime"),
      supabase.from("contact_relations").select("*"),
    ]);
    setContacts((c.data as Contact[]) ?? []);
    setProjects((p.data as Project[]) ?? []);
    setTasks((t.data as TaskRow[]) ?? []);
    setMeetings((m.data as Meeting[]) ?? []);
    setRelations((r.data as Relation[]) ?? []);
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
        .filter((c) => {
          const rt = relTypeFromTags(c.tags, c.relationship_type ?? c.type);
          if (tab === "client") return rt === "client";
          if (tab === "collaborator")
            return rt !== "client";
          return true;
        })
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

  const tabCounts = useMemo(() => {
    let clients = 0;
    let others = 0;
    for (const c of contacts) {
      const rt = relTypeFromTags(c.tags, c.relationship_type ?? c.type);
      if (rt === "client") clients++;
      else others++;
    }
    return { client: clients, collaborator: others };
  }, [contacts]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="alfred-h1">Contactos</h1>
          <p style={{ fontSize: 13, color: "#444", marginTop: 4 }}>
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
          {(["client", "collaborator"] as const).map((t) => {
            const active = tab === t;
            const count = tabCounts[t];
            const label = t === "client" ? "Clientes" : "Personas";
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: active ? "rgba(99,102,241,0.15)" : "transparent",
                  border: `1px solid ${active ? "rgba(99,102,241,0.3)" : "#222"}`,
                  color: active ? "#818cf8" : "#555",
                  borderRadius: 100,
                  padding: "6px 16px",
                  fontSize: 12,
                }}
              >
                {label}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    background: active ? "rgba(99,102,241,0.2)" : "#1a1a1a",
                    color: active ? "#818cf8" : "#666",
                    borderRadius: 100,
                    padding: "1px 7px",
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="flex items-center gap-2"
          style={{
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 100,
            padding: "8px 16px",
            minWidth: 240,
          }}
        >
          <IconSearch size={14} stroke={1.75} color="#444" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="flex-1 bg-transparent focus:outline-none"
            style={{ fontSize: 13, color: "#888" }}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="alfred-skeleton"
              style={{ height: 96, borderRadius: 12 }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState type={tab} assistantName={assistant.name} onAdd={() => setShowNew(true)} />
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const rt = relTypeFromTags(c.tags, c.relationship_type ?? c.type);
            const isClient = rt === "client";
            return (
              <ContactCard
                key={c.id}
                contact={c}
                projectCount={isClient ? projectsForClient(c.id).length : 0}
                taskCount={
                  isClient
                    ? tasksForClient(c.id).filter((t) => t.status !== "done").length
                    : tasksForCollaborator(c.id).filter((t) => t.status !== "done").length
                }
                onOpen={() => setOpenId(c.id)}
                onEdit={() => setEditing(c)}
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
            );
          })}
        </div>
      )}

      {showNew && (
        <ContactModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            reload();
          }}
          userId={user?.id ?? ""}
        />
      )}
      {editing && (
        <ContactModal
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          userId={user?.id ?? ""}
        />
      )}

      {openContact && (
        <ContactPanel
          contact={openContact}
          allContacts={contacts}
          projects={projectsForClient(openContact.id)}
          tasks={
            relTypeFromTags(openContact.tags, openContact.relationship_type ?? openContact.type) === "client"
              ? tasksForClient(openContact.id)
              : tasksForCollaborator(openContact.id)
          }
          meetings={meetings}
          relations={relations}
          onNavigate={(id) => setOpenId(id)}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(openContact)}
          onChange={reload}
          userId={user?.id ?? ""}
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
  const rt = relTypeFromTags(contact.tags, contact.relationship_type ?? contact.type);
  const isClient = rt === "client";

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#111111",
        border: `1px solid ${hover ? "rgba(99,102,241,0.3)" : "#1e1e1e"}`,
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 36,
            height: 36,
            background: "rgba(99,102,241,0.15)",
            color: "#818cf8",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {initials(contact.name)}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#f2f2f2" }}>
          {contact.name}
        </div>
        {isClient && contact.status === "active" && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 100,
              background: "rgba(16,185,129,0.1)",
              color: "#34d399",
              border: "1px solid rgba(16,185,129,0.2)",
              fontWeight: 500,
            }}
          >
            Activo
          </span>
        )}
        {!isClient && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 100,
              background: "rgba(99,102,241,0.1)",
              color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.2)",
              fontWeight: 500,
            }}
          >
            {REL_LABEL[rt]}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#555", marginLeft: 48 }}>
        {[isClient ? contact.company : contact.role, contact.email]
          .filter(Boolean)
          .join(" · ") || "—"}
      </div>
      <div className="flex items-center justify-between mt-2" style={{ marginLeft: 48 }}>
        <div style={{ fontSize: 11, color: "#333" }}>
          {isClient
            ? `${projectCount} proyecto${projectCount === 1 ? "" : "s"} · ${taskCount} tarea${taskCount === 1 ? "" : "s"} pendiente${taskCount === 1 ? "" : "s"}`
            : taskCount > 0
              ? `${taskCount} tarea${taskCount === 1 ? "" : "s"} asignada${taskCount === 1 ? "" : "s"}`
              : ""}
        </div>
        <div
          className="flex items-center gap-2"
          style={{ opacity: hover ? 1 : 0, transition: "opacity 0.15s" }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Editar"
            style={{ color: "#555", padding: 4 }}
          >
            <IconPencil size={14} stroke={1.75} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Borrar"
            style={{ color: "#555", padding: 4 }}
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
        border: "1px dashed #1e1e1e",
        borderRadius: 14,
      }}
    >
      <IconAddressBook
        size={28}
        stroke={1.5}
        color="#444"
        style={{ margin: "0 auto 12px" }}
      />
      <p
        style={{
          fontSize: 14,
          color: "#666",
          maxWidth: 380,
          margin: "0 auto 16px",
          lineHeight: 1.5,
        }}
      >
        {type === "client"
          ? `Aún no tienes clientes registrados. Agrega tu primer cliente para que ${assistantName} tenga contexto de tus proyectos.`
          : `Sin personas aún. Agrega a quienes te rodean para que ${assistantName} las recuerde.`}
      </p>
      <button
        onClick={onAdd}
        style={{
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.3)",
          color: "#818cf8",
          borderRadius: 100,
          padding: "7px 16px",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Agregar contacto
      </button>
    </div>
  );
}

/* ───────────── ContactModal (create + edit) ───────────── */

function ContactModal({
  contact,
  onClose,
  onSaved,
  userId,
}: {
  contact?: Contact;
  onClose: () => void;
  onSaved: () => void;
  userId: string;
}) {
  const isEdit = !!contact;
  const [relType, setRelType] = useState<RelType>(
    (contact?.relationship_type as RelType) ?? "client",
  );
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [company, setCompany] = useState(contact?.company ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [status, setStatus] = useState<"lead" | "active" | "inactive">(
    (contact?.status as any) ?? "active",
  );
  const [context, setContext] = useState(contact?.context ?? "");
  const [birthday, setBirthday] = useState(contact?.birthday ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [customFields, setCustomFields] = useState<{ k: string; v: string }[]>(
    Object.entries(contact?.custom_fields ?? {}).map(([k, v]) => ({
      k,
      v: String(v),
    })),
  );
  const [personalOpen, setPersonalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isWork = WORK_TYPES.includes(relType);

  const save = async () => {
    if (!name.trim() || !userId) return;
    setBusy(true);
    const cf: Record<string, string> = {};
    for (const { k, v } of customFields) {
      const key = k.trim();
      if (key) cf[key] = v.trim();
    }
    const payload: any = {
      user_id: userId,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      relationship_type: relType,
      type: isWork ? relType : "collaborator", // legacy column
      context: context.trim() || null,
      birthday: birthday || null,
      address: address.trim() || null,
      custom_fields: cf,
    };
    if (isWork) {
      payload.company = company.trim() || null;
      payload.role = role.trim() || null;
      if (relType === "client") payload.status = status;
    } else {
      payload.company = null;
      payload.role = null;
    }
    const res = isEdit
      ? await supabase.from("contacts").update(payload).eq("id", contact!.id)
      : await supabase.from("contacts").insert(payload);
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(isEdit ? "Actualizado ✓" : "Guardado ✓");
    onSaved();
  };

  const addCustom = (label?: string) => {
    setCustomFields((p) => [...p, { k: label ?? "", v: "" }]);
    setPersonalOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto"
        style={{
          width: 540,
          maxWidth: "100%",
          background: "#0d0d0d",
          border: "1px solid #1e1e1e",
          borderRadius: 14,
          padding: 22,
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontSize: 17, fontWeight: 500, color: "#f2f2f2" }}>
            {isEdit ? "Editar contacto" : "Nuevo contacto"}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "#555" }}>
            <IconX size={16} />
          </button>
        </div>

        {/* Relationship type */}
        <SectionLabel>Tipo de relación</SectionLabel>
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {REL_TYPES.map((t) => {
            const active = relType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setRelType(t.id)}
                style={{
                  background: active ? "rgba(99,102,241,0.15)" : "transparent",
                  border: `1px solid ${active ? "rgba(99,102,241,0.3)" : "#222"}`,
                  color: active ? "#818cf8" : "#666",
                  borderRadius: 100,
                  padding: "5px 14px",
                  fontSize: 12,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-3 mb-5">
          <BareInput value={name} onChange={setName} placeholder="Nombre completo" autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <BareInput value={email} onChange={setEmail} placeholder="email@ejemplo.com" />
            <BareInput value={phone} onChange={setPhone} placeholder="Teléfono" />
          </div>

          {isWork && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <BareInput
                  value={company}
                  onChange={setCompany}
                  placeholder={relType === "client" ? "Empresa" : "Empresa (opcional)"}
                />
                <BareInput
                  value={role}
                  onChange={setRole}
                  placeholder={relType === "client" ? "Su rol" : "Rol / función"}
                />
              </div>
              {relType === "client" && (
                <div className="flex items-center gap-2">
                  {(["lead", "active", "inactive"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      style={{
                        background: status === s ? "rgba(99,102,241,0.15)" : "transparent",
                        border: `1px solid ${status === s ? "rgba(99,102,241,0.3)" : "#222"}`,
                        color: status === s ? "#818cf8" : "#555",
                        borderRadius: 100,
                        padding: "4px 12px",
                        fontSize: 11,
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Personal context */}
        <SectionLabel>Contexto personal</SectionLabel>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={5}
          placeholder="¿Quién es esta persona? Cuéntame lo que quieras que recuerde sobre ella. Puede ser su historia, su personalidad, datos importantes, sus mascotas, sus hijos..."
          className="w-full focus:outline-none resize-y"
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "#ccc",
            background: "#0d0d0d",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 18,
          }}
        />

        {/* Personal data (collapsible) */}
        <button
          onClick={() => setPersonalOpen((p) => !p)}
          className="w-full flex items-center justify-between"
          style={{
            background: "transparent",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: "10px 14px",
            color: "#888",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Datos personales
          {personalOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </button>

        {personalOpen && (
          <div className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Cumpleaños</FieldLabel>
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  className="w-full focus:outline-none"
                  style={{
                    fontSize: 13,
                    color: birthday ? "#ccc" : "#444",
                    background: "#0d0d0d",
                    border: "1px solid #1e1e1e",
                    borderRadius: 10,
                    padding: "8px 12px",
                    colorScheme: "dark",
                  }}
                />
                {birthday && (
                  <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                    {formatBirthday(birthday)}
                  </div>
                )}
              </div>
              <div>
                <FieldLabel>Comuna / Dirección</FieldLabel>
                <BareInput value={address} onChange={setAddress} placeholder="Ej: Peñalolén" />
              </div>
            </div>

            {customFields.length > 0 && (
              <div className="space-y-2">
                {customFields.map((cf, idx) => (
                  <CustomFieldRow
                    key={idx}
                    keyName={cf.k}
                    value={cf.v}
                    onChange={(k, v) =>
                      setCustomFields((prev) =>
                        prev.map((x, i) => (i === idx ? { k, v } : x)),
                      )
                    }
                    onRemove={() =>
                      setCustomFields((prev) => prev.filter((_, i) => i !== idx))
                    }
                  />
                ))}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => addCustom()}
                  className="flex items-center gap-1"
                  style={{
                    fontSize: 12,
                    color: "#818cf8",
                    border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 100,
                    padding: "4px 12px",
                  }}
                >
                  <IconPlus size={12} /> Agregar dato
                </button>
                {CUSTOM_FIELD_SUGGESTIONS.filter(
                  (s) => !customFields.some((c) => c.k.toLowerCase() === s.toLowerCase()),
                ).map((s) => (
                  <button
                    key={s}
                    onClick={() => addCustom(s)}
                    style={{
                      fontSize: 11,
                      color: "#666",
                      border: "1px solid #222",
                      borderRadius: 100,
                      padding: "3px 10px",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: "#555", padding: "7px 14px" }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.4)",
              color: "#818cf8",
              borderRadius: 100,
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#555",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "#444", marginBottom: 4 }}>{children}</div>
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
      className="w-full focus:outline-none"
      style={{
        fontSize: 13,
        color: "#ccc",
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 10,
        padding: "8px 12px",
      }}
    />
  );
}

function CustomFieldRow({
  keyName,
  value,
  onChange,
  onRemove,
}: {
  keyName: string;
  value: string;
  onChange: (k: string, v: string) => void;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="flex items-center gap-2 group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <input
        value={keyName}
        onChange={(e) => onChange(e.target.value, value)}
        placeholder="Etiqueta"
        className="focus:outline-none"
        style={{
          width: 140,
          fontSize: 12,
          color: "#aaa",
          background: "#0d0d0d",
          border: "1px solid #1e1e1e",
          borderRadius: 10,
          padding: "7px 10px",
        }}
      />
      <input
        value={value}
        onChange={(e) => onChange(keyName, e.target.value)}
        placeholder="Valor"
        className="flex-1 focus:outline-none"
        style={{
          fontSize: 13,
          color: "#ccc",
          background: "#0d0d0d",
          border: "1px solid #1e1e1e",
          borderRadius: 10,
          padding: "7px 10px",
        }}
      />
      <button
        onClick={onRemove}
        aria-label="Eliminar"
        style={{ color: "#444", opacity: hover ? 1 : 0, transition: "opacity 0.15s" }}
      >
        <IconTrash size={14} />
      </button>
    </div>
  );
}

/* ───────────── Detail Panel ───────────── */

type PanelTab = "profile" | "projects" | "meetings" | "links";

function ContactPanel({
  contact,
  allContacts,
  projects,
  tasks,
  meetings,
  relations,
  onClose,
  onEdit,
  onChange,
  onNavigate,
  userId,
}: {
  contact: Contact;
  allContacts: Contact[];
  projects: Project[];
  tasks: TaskRow[];
  meetings: Meeting[];
  relations: Relation[];
  onClose: () => void;
  onEdit: () => void;
  onChange: () => void;
  onNavigate: (id: string) => void;
  userId: string;
}) {
  const [tab, setTab] = useState<PanelTab>("profile");
  const [showLinkModal, setShowLinkModal] = useState(false);

  useEffect(() => {
    setTab("profile");
  }, [contact.id]);

  const rt = relTypeFromTags(contact.tags, contact.relationship_type ?? contact.type);
  const birthdayLabel = formatBirthday(contact.birthday);
  const days = daysUntilBirthday(contact.birthday);
  const birthdaySoon = days !== null && days <= 7;

  const myRelations = relations.filter(
    (r) => r.contact_a === contact.id || r.contact_b === contact.id,
  );

  const linkedContacts = myRelations
    .map((r) => {
      const otherId = r.contact_a === contact.id ? r.contact_b : r.contact_a;
      return { relation: r, other: allContacts.find((c) => c.id === otherId) };
    })
    .filter((x) => !!x.other) as { relation: Relation; other: Contact }[];

  const customEntries = Object.entries(contact.custom_fields ?? {}).filter(
    ([k]) => k && k.trim(),
  );

  const contactMeetings = meetings.filter((m) =>
    m.title.toLowerCase().includes(contact.name.toLowerCase()),
  );

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
          width: 380,
          maxWidth: "100%",
          background: "#0a0a0a",
          borderLeft: "1px solid #1e1e1e",
          animation: "alfredPanelIn 200ms ease both",
        }}
      >
        <style>{`
          @keyframes alfredPanelIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `}</style>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: 48,
                height: 48,
                background: "rgba(99,102,241,0.15)",
                color: "#818cf8",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {initials(contact.name)}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                aria-label="Editar"
                style={{ color: "#555", padding: 4 }}
              >
                <IconPencil size={15} />
              </button>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                style={{ color: "#555", padding: 4 }}
              >
                <IconX size={16} />
              </button>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "#f2f2f2" }}>
            {contact.name}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              style={{
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 100,
                background: "rgba(99,102,241,0.1)",
                color: "#818cf8",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              {REL_LABEL[rt]}
            </span>
            {rt === "client" && contact.status === "active" && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 10px",
                  borderRadius: 100,
                  background: "rgba(16,185,129,0.1)",
                  color: "#34d399",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                Activo
              </span>
            )}
          </div>
          {birthdayLabel && (
            <div className="flex items-center gap-2 mt-2.5">
              <span style={{ fontSize: 13, color: "#888" }}>
                🎂 {birthdayLabel}
              </span>
              {birthdaySoon && (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 8px",
                    borderRadius: 100,
                    background: "rgba(217,119,6,0.12)",
                    color: "#fbbf24",
                    border: "1px solid rgba(217,119,6,0.2)",
                    fontWeight: 600,
                  }}
                >
                  {days === 0 ? "Hoy" : "Pronto"}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 mb-4 overflow-x-auto">
          {(
            [
              { k: "profile", l: "Perfil" },
              { k: "projects", l: "Proyectos" },
              { k: "meetings", l: "Reuniones" },
              { k: "links", l: `Vínculos${linkedContacts.length ? ` ${linkedContacts.length}` : ""}` },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as PanelTab)}
              style={{
                fontSize: 12,
                padding: "5px 12px",
                borderRadius: 100,
                background: tab === t.k ? "rgba(99,102,241,0.15)" : "transparent",
                border: `1px solid ${tab === t.k ? "rgba(99,102,241,0.3)" : "#222"}`,
                color: tab === t.k ? "#818cf8" : "#555",
                whiteSpace: "nowrap",
              }}
            >
              {t.l}
            </button>
          ))}
        </div>

        <div className="px-6 pb-8">
          {tab === "profile" && (
            <ProfileTab
              contact={contact}
              customEntries={customEntries}
              birthdayLabel={birthdayLabel}
            />
          )}
          {tab === "projects" && (
            <div className="space-y-2">
              {projects.length === 0 ? (
                <p style={{ fontSize: 13, color: "#555" }}>Sin proyectos vinculados.</p>
              ) : (
                projects.map((p) => {
                  const projTasks = tasks.filter((t) => t.project_id === p.id);
                  const done = projTasks.filter((t) => t.status === "done").length;
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: "#111",
                        border: "1px solid #1e1e1e",
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#e0e0e0" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                        {done}/{projTasks.length} tareas
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {tab === "meetings" && (
            <div className="space-y-2">
              {contactMeetings.length === 0 ? (
                <p style={{ fontSize: 13, color: "#555" }}>
                  Sin reuniones registradas con {contact.name.split(" ")[0]}.
                </p>
              ) : (
                contactMeetings.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      background: "#111",
                      border: "1px solid #1e1e1e",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#e0e0e0" }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                      {new Intl.DateTimeFormat("es-CL", {
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(m.datetime))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === "links" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Vínculos</SectionLabel>
                <button
                  onClick={() => setShowLinkModal(true)}
                  className="flex items-center gap-1"
                  style={{
                    fontSize: 12,
                    color: "#818cf8",
                    border: "1px solid rgba(99,102,241,0.3)",
                    borderRadius: 100,
                    padding: "3px 10px",
                  }}
                >
                  <IconPlus size={11} /> Vincular
                </button>
              </div>
              {linkedContacts.length === 0 ? (
                <p style={{ fontSize: 13, color: "#555" }}>
                  Aún no hay vínculos. Conecta a {contact.name.split(" ")[0]} con otros
                  contactos.
                </p>
              ) : (
                linkedContacts.map(({ relation, other }) => (
                  <div
                    key={relation.id}
                    onClick={() => onNavigate(other.id)}
                    className="cursor-pointer"
                    style={{
                      background: "#111",
                      border: "1px solid #1e1e1e",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 26,
                          height: 26,
                          background: "rgba(99,102,241,0.15)",
                          color: "#818cf8",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {initials(other.name)}
                      </div>
                      <div style={{ fontSize: 13, color: "#e0e0e0", flex: 1 }}>
                        {other.name}
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 8px",
                          borderRadius: 100,
                          background: "rgba(99,102,241,0.1)",
                          color: "#818cf8",
                          border: "1px solid rgba(99,102,241,0.2)",
                        }}
                      >
                        {relation.relation_label}
                      </span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm("¿Eliminar este vínculo?")) return;
                          await supabase
                            .from("contact_relations")
                            .delete()
                            .eq("id", relation.id);
                          onChange();
                        }}
                        aria-label="Eliminar vínculo"
                        style={{ color: "#444" }}
                      >
                        <IconTrash size={12} />
                      </button>
                    </div>
                    {relation.shared_context && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#555",
                          fontStyle: "italic",
                          marginTop: 4,
                          lineHeight: 1.5,
                        }}
                      >
                        {relation.shared_context}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {showLinkModal && (
        <LinkContactModal
          contact={contact}
          allContacts={allContacts}
          existingRelations={myRelations}
          userId={userId}
          onClose={() => setShowLinkModal(false)}
          onSaved={() => {
            setShowLinkModal(false);
            onChange();
          }}
        />
      )}
    </>
  );
}

function ProfileTab({
  contact,
  customEntries,
  birthdayLabel,
}: {
  contact: Contact;
  customEntries: [string, string][];
  birthdayLabel: string | null;
}) {
  return (
    <div className="space-y-5">
      {contact.context && (
        <div>
          <SectionLabel>Contexto</SectionLabel>
          <div
            style={{
              background: "#0d0d0d",
              borderLeft: "2px solid #222",
              borderRadius: "0 8px 8px 0",
              padding: "12px 16px",
              fontSize: 13,
              color: "#888",
              lineHeight: 1.7,
              fontStyle: "italic",
              whiteSpace: "pre-wrap",
            }}
          >
            {contact.context}
          </div>
        </div>
      )}

      {(contact.email || contact.phone || contact.company || contact.role) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {contact.email && <KV k="Email" v={contact.email} />}
          {contact.phone && <KV k="Teléfono" v={contact.phone} />}
          {contact.company && <KV k="Empresa" v={contact.company} />}
          {contact.role && <KV k="Rol" v={contact.role} />}
        </div>
      )}

      {(contact.address || birthdayLabel || customEntries.length > 0) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {contact.address && (
            <KV
              k="Dirección"
              v={
                <span className="inline-flex items-center gap-1">
                  <IconMapPin size={11} color="#555" />
                  {contact.address}
                </span>
              }
            />
          )}
          {birthdayLabel && (
            <KV
              k="Cumpleaños"
              v={
                <span className="inline-flex items-center gap-1">
                  <IconCake size={11} color="#fbbf24" />
                  {birthdayLabel}
                </span>
              }
            />
          )}
          {customEntries.map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
        </div>
      )}

      {!contact.context &&
        customEntries.length === 0 &&
        !contact.address &&
        !birthdayLabel && (
          <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6 }}>
            Sin contexto aún. Edita este contacto para agregar información personal.
          </p>
        )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#444", textTransform: "capitalize" }}>{k}</div>
      <div style={{ fontSize: 13, color: "#ccc", marginTop: 2, wordBreak: "break-word" }}>
        {v}
      </div>
    </div>
  );
}

/* ───────────── Link Modal ───────────── */

function LinkContactModal({
  contact,
  allContacts,
  existingRelations,
  userId,
  onClose,
  onSaved,
}: {
  contact: Contact;
  allContacts: Contact[];
  existingRelations: Relation[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [shared, setShared] = useState("");
  const [busy, setBusy] = useState(false);

  const linkedIds = new Set(
    existingRelations.flatMap((r) => [r.contact_a, r.contact_b]).filter((id) => id !== contact.id),
  );

  const candidates = allContacts
    .filter((c) => c.id !== contact.id && !linkedIds.has(c.id))
    .filter((c) =>
      search.trim() ? c.name.toLowerCase().includes(search.toLowerCase()) : true,
    )
    .slice(0, 6);

  const save = async () => {
    if (!selectedId || !label.trim() || !userId) return;
    setBusy(true);
    const { error } = await supabase.from("contact_relations").insert({
      user_id: userId,
      contact_a: contact.id,
      contact_b: selectedId,
      relation_label: label.trim(),
      shared_context: shared.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Vínculo creado ✓");
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          background: "#0d0d0d",
          border: "1px solid #1e1e1e",
          borderRadius: 14,
          padding: 22,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "#f2f2f2" }}>
            Vincular con otro contacto
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: "#555" }}>
            <IconX size={16} />
          </button>
        </div>

        <SectionLabel>Contacto</SectionLabel>
        {selectedId ? (
          (() => {
            const sel = allContacts.find((c) => c.id === selectedId);
            return (
              <div
                className="flex items-center justify-between mb-4"
                style={{
                  background: "#111",
                  border: "1px solid rgba(99,102,241,0.3)",
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: 24,
                      height: 24,
                      background: "rgba(99,102,241,0.15)",
                      color: "#818cf8",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {initials(sel?.name ?? "")}
                  </div>
                  <span style={{ fontSize: 13, color: "#e0e0e0" }}>{sel?.name}</span>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ color: "#555" }}>
                  <IconX size={14} />
                </button>
              </div>
            );
          })()
        ) : (
          <>
            <BareInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar contacto por nombre..."
            />
            {search.trim() && (
              <div className="mt-2 space-y-1 mb-4">
                {candidates.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#555", padding: "6px 4px" }}>
                    Sin resultados.
                  </p>
                ) : (
                  candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id);
                        setSearch("");
                      }}
                      className="w-full flex items-center gap-2 text-left"
                      style={{
                        background: "#111",
                        border: "1px solid #1e1e1e",
                        borderRadius: 10,
                        padding: "6px 10px",
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: 22,
                          height: 22,
                          background: "rgba(99,102,241,0.15)",
                          color: "#818cf8",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {initials(c.name)}
                      </div>
                      <span style={{ fontSize: 13, color: "#ccc" }}>{c.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {!search.trim() && <div className="mb-4" />}
          </>
        )}

        <SectionLabel>Tipo de vínculo</SectionLabel>
        <BareInput
          value={label}
          onChange={setLabel}
          placeholder="Ej: esposo/a, amigo/a, socio/a..."
        />
        <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
          {RELATION_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setLabel(s)}
              style={{
                fontSize: 11,
                color: "#666",
                border: "1px solid #222",
                borderRadius: 100,
                padding: "3px 10px",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        <SectionLabel>Contexto compartido</SectionLabel>
        <textarea
          value={shared}
          onChange={(e) => setShared(e.target.value)}
          rows={3}
          placeholder="¿Qué tienen en común? (lugar donde viven, proyectos compartidos, historia en común...)"
          className="w-full focus:outline-none resize-none"
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "#ccc",
            background: "#0d0d0d",
            border: "1px solid #1e1e1e",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        />

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            style={{ fontSize: 13, color: "#555", padding: "7px 14px" }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || !selectedId || !label.trim()}
            style={{
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.4)",
              color: "#818cf8",
              borderRadius: 100,
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: 500,
              opacity: busy || !selectedId || !label.trim() ? 0.5 : 1,
            }}
          >
            <span className="inline-flex items-center gap-1">
              <IconLink size={12} />
              {busy ? "Guardando…" : "Vincular"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
