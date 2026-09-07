import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  IconX,
  IconCheck,
  IconTrash,
  IconLoader2,
  IconCircleCheck,
  IconFlag,
  IconFolder,
  IconUser,
  IconChevronRight,
  IconSearch,
  IconAlertCircle,
  IconArrowRight,
  IconPlus,
} from "@tabler/icons-react";
import { Calendar } from "@/components/ui/calendar";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
import { cn } from "@/lib/utils";

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  project_id: string | null;
  status: string;
  contact_ids?: string[] | null;
};

type ProjectOption = { id: string; name: string };
type ContactOption = { id: string; name: string };

const PRIORITIES = [
  { id: "urgent", label: "Urgente", dot: "#ef4444", bg: "rgba(239,68,68,.1)", color: "#f87171" },
  { id: "high", label: "Alta", dot: "#f97316", bg: "rgba(249,115,22,.1)", color: "#fb923c" },
  { id: "medium", label: "Media", dot: "#eab308", bg: "rgba(234,179,8,.1)", color: "#facc15" },
  { id: "low", label: "Baja", dot: "#555", bg: "#1c1c1c", color: "#555" },
];

const STATUSES = [
  { id: "borrador", label: "Borrador", bg: "#202020", color: "#777", border: "1px solid #2c2c2c" },
  { id: "en_curso", label: "En curso", bg: "rgba(59,130,246,.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,.2)" },
  { id: "listo", label: "Listo", bg: "rgba(34,197,94,.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,.2)" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function toISODay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromISODay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function formatDay(s: string) {
  const d = fromISODay(s);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function isOverdue(s: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return fromISODay(s).getTime() < today.getTime();
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function EditTaskModal({
  task,
  projects,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: EditableTask;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved: (updated: EditableTask) => void;
  onDeleted: (id: string) => void;
}) {
  const initialTitle = stripMentionSyntaxLoose(task.title);
  const initialDescription = stripMentionSyntaxLoose(task.description ?? "");

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [priority, setPriority] = useState(task.priority || "medium");
  const [status, setStatus] = useState(task.status || "borrador");
  const [startDate, setStartDate] = useState(
    task.start_date ? toISODay(new Date(task.start_date)) : "",
  );
  const [dueDate, setDueDate] = useState(
    task.due_date ? toISODay(new Date(task.due_date)) : "",
  );
  const [projectId, setProjectId] = useState<string>(task.project_id ?? "");
  const [contactIds, setContactIds] = useState<string[]>(task.contact_ids ?? []);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [openMenu, setOpenMenu] = useState<null | "status" | "priority" | "project" | "contact">(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [showStart, setShowStart] = useState(!!task.start_date);
  const [picker, setPicker] = useState<null | "start" | "due">(null);
  const [draftDate, setDraftDate] = useState<Date | undefined>(undefined);

  const dirty = useRef(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("contacts").select("id, name").order("name");
      if (alive && data) setContacts(data as ContactOption[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Auto-save debounced — only fires after the user actually edits a field.
  useEffect(() => {
    if (!dirty.current) return;
    if (!title.trim()) return;
    setSaveStatus("saving");
    const handle = setTimeout(async () => {
      const patch = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        start_date: startDate ? new Date(startDate).toISOString() : null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        project_id: projectId || null,
        contact_ids: contactIds,
      };
      const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
      if (error) {
        setSaveStatus("error");
        toast.error(error.message);
        return;
      }
      onSaved({ ...task, ...patch });
      setSaveStatus("saved");
      if (savedTimeout.current) clearTimeout(savedTimeout.current);
      savedTimeout.current = setTimeout(() => setSaveStatus("idle"), 1500);
    }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, priority, status, startDate, dueDate, projectId, contactIds]);

  const markDirty = () => {
    dirty.current = true;
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDeleted(task.id);
    onClose();
  };

  const statusMeta = STATUSES.find((s) => s.id === status) ?? STATUSES[0];
  const priorityMeta = PRIORITIES.find((p) => p.id === priority) ?? PRIORITIES[2];
  const projectName = projects.find((p) => p.id === projectId)?.name ?? "";
  const selectedContacts = useMemo(
    () => contactIds.map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as ContactOption[],
    [contactIds, contacts],
  );

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
  );
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(contactQuery.trim().toLowerCase()),
  );

  const applyDate = () => {
    if (!draftDate || !picker) return;
    markDirty();
    if (picker === "start") setStartDate(toISODay(draftDate));
    else setDueDate(toISODay(draftDate));
    setPicker(null);
  };

  return (
    <div className="fixed inset-0 z-50 animate-fade-in">
      <style>{`
        .etm-editable:empty::before {
          content: attr(data-placeholder);
          color: #4a4a4a;
          pointer-events: none;
        }
      `}</style>

      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={onClose}
      />

      <div
        className={cn(
          "absolute left-0 right-0 bottom-0 flex flex-col",
          "sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:w-[560px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[86vh]",
        )}
        style={{
          top: "44px",
          background: "var(--bg-base, #08081a)",
          borderRadius: 24,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.55)",
        }}
        onClick={() => setOpenMenu(null)}
      >
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div style={{ width: 40, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <header
          className="flex items-center justify-between flex-shrink-0"
          style={{ padding: "12px 18px", borderBottom: "0.5px solid var(--border, #1e1e1e)" }}
        >
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex items-center gap-2"
            style={{ color: "var(--text-secondary, #999)", fontSize: 13 }}
          >
            <IconX size={18} />
            <span className="hidden sm:inline">Volver</span>
          </button>

          <SaveIndicator status={saveStatus} />

          <button onClick={remove} aria-label="Eliminar" style={{ color: "#f87171", padding: 6 }} className="hover:opacity-80">
            <IconTrash size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto" style={{ maxWidth: 720, padding: "22px 20px 70px" }}>
            {/* TITLE — Notion style */}
            <div
              ref={titleRef}
              className="etm-editable focus:outline-none"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Título de la tarea"
              onInput={(e) => {
                markDirty();
                setTitle((e.target as HTMLDivElement).innerText);
              }}
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#eaeaea",
                lineHeight: 1.3,
                minHeight: 32,
                outline: "none",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {initialTitle}
            </div>

            <hr style={{ border: "none", borderTop: "0.5px solid var(--border, #1e1e1e)", margin: "16px 0 6px" }} />

            {/* STATUS */}
            <PropertyRow
              icon={<IconCircleCheck size={13} />}
              iconBg="rgba(99,102,241,0.12)"
              iconColor="#818cf8"
              label="Estado"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "status" ? null : "status");
              }}
              value={<Badge bg={statusMeta.bg} color={statusMeta.color} border={statusMeta.border}>{statusMeta.label}</Badge>}
              menu={
                openMenu === "status" ? (
                  <Menu>
                    {STATUSES.map((s) => (
                      <MenuItem
                        key={s.id}
                        onClick={() => {
                          markDirty();
                          setStatus(s.id);
                          setOpenMenu(null);
                        }}
                        selected={s.id === status}
                      >
                        <Badge bg={s.bg} color={s.color} border={s.border}>{s.label}</Badge>
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null
              }
            />

            {/* PRIORITY */}
            <PropertyRow
              icon={<IconFlag size={13} />}
              iconBg="rgba(234,179,8,0.1)"
              iconColor="#facc15"
              label="Prioridad"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "priority" ? null : "priority");
              }}
              value={
                <Badge bg={priorityMeta.bg} color={priorityMeta.color}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: priorityMeta.dot, display: "inline-block", marginRight: 6 }} />
                  {priorityMeta.label}
                </Badge>
              }
              menu={
                openMenu === "priority" ? (
                  <Menu>
                    {PRIORITIES.map((p) => (
                      <MenuItem
                        key={p.id}
                        onClick={() => {
                          markDirty();
                          setPriority(p.id);
                          setOpenMenu(null);
                        }}
                        selected={p.id === priority}
                      >
                        <Badge bg={p.bg} color={p.color}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: p.dot, display: "inline-block", marginRight: 6 }} />
                          {p.label}
                        </Badge>
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null
              }
            />

            {/* PROJECT */}
            <PropertyRow
              icon={<IconFolder size={13} />}
              iconBg="rgba(99,102,241,0.12)"
              iconColor="#818cf8"
              label="Proyecto"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "project" ? null : "project");
                setProjectQuery("");
              }}
              value={
                projectName ? (
                  <span style={{ fontSize: 13, color: "#ccc" }}>{projectName}</span>
                ) : (
                  <span style={{ fontSize: 13, color: "#555" }}>Sin proyecto</span>
                )
              }
              menu={
                openMenu === "project" ? (
                  <Menu>
                    <SearchField value={projectQuery} onChange={setProjectQuery} placeholder="Buscar proyecto…" />
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      <MenuItem
                        onClick={() => {
                          markDirty();
                          setProjectId("");
                          setOpenMenu(null);
                        }}
                        selected={!projectId}
                      >
                        <span style={{ fontSize: 13, color: "#888" }}>Sin proyecto</span>
                      </MenuItem>
                      {filteredProjects.map((p) => (
                        <MenuItem
                          key={p.id}
                          onClick={() => {
                            markDirty();
                            setProjectId(p.id);
                            setOpenMenu(null);
                          }}
                          selected={p.id === projectId}
                        >
                          <span style={{ fontSize: 13, color: "#ccc" }}>{p.name}</span>
                        </MenuItem>
                      ))}
                      {filteredProjects.length === 0 && (
                        <div style={{ fontSize: 12, color: "#555", padding: "8px 10px" }}>Sin resultados</div>
                      )}
                    </div>
                  </Menu>
                ) : null
              }
            />

            {/* CONTACTS */}
            <PropertyRow
              icon={<IconUser size={13} />}
              iconBg="rgba(236,72,153,0.12)"
              iconColor="#f472b6"
              label="Contacto"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === "contact" ? null : "contact");
                setContactQuery("");
              }}
              value={
                selectedContacts.length ? (
                  <div className="flex flex-wrap" style={{ gap: 4 }}>
                    {selectedContacts.map((c) => (
                      <ContactChip
                        key={c.id}
                        name={c.name}
                        onRemove={(e) => {
                          e.stopPropagation();
                          markDirty();
                          setContactIds((prev) => prev.filter((id) => id !== c.id));
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: "#555" }}>Sin contactos</span>
                )
              }
              menu={
                openMenu === "contact" ? (
                  <Menu>
                    <SearchField value={contactQuery} onChange={setContactQuery} placeholder="Buscar contacto…" />
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {filteredContacts.map((c) => (
                        <MenuItem
                          key={c.id}
                          keepOpen
                          onClick={() => {
                            markDirty();
                            setContactIds((prev) =>
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                            );
                          }}
                          selected={contactIds.includes(c.id)}
                        >
                          <span style={{ fontSize: 13, color: "#ccc" }}>{c.name}</span>
                        </MenuItem>
                      ))}
                      {filteredContacts.length === 0 && (
                        <div style={{ fontSize: 12, color: "#555", padding: "8px 10px" }}>Sin resultados</div>
                      )}
                    </div>
                  </Menu>
                ) : null
              }
            />

            {/* DATES */}
            <div style={{ borderTop: "0.5px solid var(--border, #1e1e1e)", marginTop: 8, paddingTop: 16 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                {showStart && (
                  <>
                    <DateBox
                      label="INICIO"
                      value={startDate}
                      overdue={false}
                      onOpen={() => {
                        setPicker(picker === "start" ? null : "start");
                        setDraftDate(startDate ? fromISODay(startDate) : new Date());
                      }}
                      onClear={() => {
                        markDirty();
                        setStartDate("");
                        setShowStart(false);
                        setPicker(null);
                      }}
                    />
                    <IconArrowRight size={14} style={{ color: "#444", flexShrink: 0 }} />
                  </>
                )}
                <DateBox
                  label={showStart ? "TÉRMINO" : "FINALIZACIÓN"}
                  value={dueDate}
                  overdue={!!dueDate && isOverdue(dueDate)}
                  onOpen={() => {
                    setPicker(picker === "due" ? null : "due");
                    setDraftDate(dueDate ? fromISODay(dueDate) : new Date());
                  }}
                  onClear={() => {
                    markDirty();
                    setDueDate("");
                    setPicker(null);
                  }}
                />
              </div>

              {picker && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 10,
                    background: "#111",
                    border: "0.5px solid #252525",
                    borderRadius: 12,
                    padding: 8,
                  }}
                >
                  <Calendar
                    mode="single"
                    selected={draftDate}
                    onSelect={setDraftDate}
                    className={cn("p-2 pointer-events-auto")}
                  />
                  <div className="flex justify-end gap-2" style={{ padding: "0 6px 6px" }}>
                    <button onClick={() => setPicker(null)} style={{ fontSize: 12, color: "#777", padding: "6px 12px" }}>
                      Cancelar
                    </button>
                    <button
                      onClick={applyDate}
                      style={{
                        fontSize: 12,
                        color: "#fff",
                        background: "#6366f1",
                        borderRadius: 8,
                        padding: "6px 14px",
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}

              {dueDate && isOverdue(dueDate) && (
                <div className="flex items-center" style={{ gap: 5, marginTop: 8, fontSize: 12, color: "#f87171" }}>
                  <IconAlertCircle size={13} /> Fecha vencida
                </div>
              )}

              {!showStart && (
                <button
                  onClick={() => setShowStart(true)}
                  className="flex items-center"
                  style={{ gap: 4, marginTop: 10, fontSize: 12, color: "#666" }}
                >
                  <IconPlus size={12} /> Agregar fecha de inicio
                </button>
              )}
            </div>

            {/* DESCRIPTION */}
            <div
              ref={descRef}
              className="etm-editable focus:outline-none"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Notas, contexto, enlaces…"
              onInput={(e) => {
                markDirty();
                setDescription((e.target as HTMLDivElement).innerText);
              }}
              style={{
                marginTop: 22,
                fontSize: 14,
                lineHeight: 1.75,
                color: "#666",
                minHeight: 160,
                background: "transparent",
                border: "none",
                outline: "none",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {initialDescription}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  onClick,
  menu,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  menu?: React.ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={onClick}
        className="cursor-pointer"
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: iconBg,
            color: iconColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <span style={{ width: 84, flexShrink: 0, fontSize: 12, color: "#666" }}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>{value}</div>
        <IconChevronRight size={13} style={{ color: "#3a3a3a", flexShrink: 0 }} />
      </div>
      {menu}
    </div>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="z-50"
      style={{
        position: "absolute",
        top: "100%",
        left: 32,
        right: 0,
        marginTop: 2,
        background: "#131313",
        border: "0.5px solid #262626",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
        padding: 4,
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  selected,
  keepOpen,
}: {
  children: React.ReactNode;
  onClick: () => void;
  selected?: boolean;
  keepOpen?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        if (keepOpen) e.stopPropagation();
        onClick();
      }}
      className="w-full hover:bg-white/5"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "7px 8px",
        borderRadius: 7,
        textAlign: "left",
      }}
    >
      <span className="truncate">{children}</span>
      {selected && <IconCheck size={13} style={{ color: "#6366f1", flexShrink: 0 }} />}
    </button>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 6, padding: "6px 8px", borderBottom: "0.5px solid #222", marginBottom: 4 }}
    >
      <IconSearch size={13} style={{ color: "#555" }} />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent focus:outline-none"
        style={{ fontSize: 13, color: "#ddd" }}
      />
    </div>
  );
}

function Badge({
  children,
  bg,
  color,
  border,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
  border?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color,
        border: border ?? "1px solid transparent",
      }}
    >
      {children}
    </span>
  );
}

function ContactChip({ name, onRemove }: { name: string; onRemove: (e: React.MouseEvent) => void }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 3px",
        borderRadius: 999,
        background: "#1e1e1e",
        border: "1px solid #2a2a2a",
        fontSize: 12,
        color: "#aaa",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          color: "#fff",
          fontSize: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initials}
      </span>
      {parts[0]}
      <button
        onClick={onRemove}
        className="etm-chip-x"
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#252525",
          border: "none",
          color: "#444",
          fontSize: 7,
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#3a1515";
          e.currentTarget.style.color = "#f87171";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#252525";
          e.currentTarget.style.color = "#444";
        }}
      >
        ×
      </button>
    </span>
  );
}

function DateBox({
  label,
  value,
  overdue,
  onOpen,
  onClear,
}: {
  label: string;
  value: string;
  overdue: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="cursor-pointer flex-1"
      style={{
        position: "relative",
        background: "#1c1c1c",
        border: "0.5px solid #252525",
        borderRadius: 9,
        padding: "9px 12px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "#5a5a5a" }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2, color: overdue ? "#f87171" : value ? "#ddd" : "#555" }}>
        {value ? formatDay(value) : "Sin fecha"}
      </div>
      {value && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Quitar fecha"
          style={{ position: "absolute", top: 6, right: 6, color: "#4a4a4a" }}
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return <span style={{ fontSize: 11, color: "#444" }}>Auto-guardado</span>;
  if (status === "saving")
    return (
      <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: "#888" }}>
        <IconLoader2 size={12} className="animate-spin" /> Guardando…
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1.5 animate-fade-in" style={{ fontSize: 11, color: "#4ade80" }}>
        <IconCheck size={12} /> Guardado
      </span>
    );
  return <span style={{ fontSize: 11, color: "#f87171" }}>Error al guardar</span>;
}
