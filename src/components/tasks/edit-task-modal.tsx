import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { IconX, IconCheck, IconTrash, IconLoader2 } from "@tabler/icons-react";

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  project_id: string | null;
  status: string;
};

type ProjectOption = { id: string; name: string };

const PRIORITIES = [
  { id: "urgent", label: "Urgente", color: "#f87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.35)" },
  { id: "high", label: "Alta", color: "#fb923c", bg: "rgba(234,88,12,0.15)", border: "rgba(234,88,12,0.35)" },
  { id: "medium", label: "Media", color: "#fbbf24", bg: "rgba(217,119,6,0.15)", border: "rgba(217,119,6,0.35)" },
  { id: "low", label: "Baja", color: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.25)" },
];

const STATUSES = [
  { id: "borrador", label: "Borrador", color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.3)" },
  { id: "en_curso", label: "En Curso", color: "#a78bfa", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" },
  { id: "listo", label: "Listo", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
];

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
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority || "medium");
  const [status, setStatus] = useState(task.status || "borrador");
  const [startDate, setStartDate] = useState(
    task.start_date ? new Date(task.start_date).toISOString().slice(0, 10) : "",
  );
  const [dueDate, setDueDate] = useState(
    task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : "",
  );
  const [projectId, setProjectId] = useState<string>(task.project_id ?? "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const dirty = useRef(false);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
  }, [title, description, priority, status, startDate, dueDate, projectId]);

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

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in"
      style={{ background: "var(--bg-base, #08081a)" }}
    >
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <header
          className="flex items-center justify-between flex-shrink-0"
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border, #1e1e1e)",
          }}
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

          <button
            onClick={remove}
            aria-label="Eliminar"
            style={{ color: "#f87171", padding: 6 }}
            className="hover:opacity-80"
          >
            <IconTrash size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto" style={{ maxWidth: 720, padding: "32px 24px 80px" }}>
            <input
              autoFocus
              value={title}
              onChange={(e) => { markDirty(); setTitle(e.target.value); }}
              placeholder="Título de la tarea"
              className="w-full bg-transparent focus:outline-none"
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: "#eaeaea",
                border: "none",
                padding: "4px 0 16px",
                marginBottom: 24,
                borderBottom: "1px solid var(--border, #1e1e1e)",
              }}
            />

            <Field label="Estado">
              <div className="flex gap-1.5 flex-wrap">
                {STATUSES.map((s) => {
                  const active = status === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { markDirty(); setStatus(s.id); }}
                      style={{
                        fontSize: 12,
                        padding: "6px 14px",
                        borderRadius: 100,
                        background: active ? s.bg : "transparent",
                        border: `1px solid ${active ? s.border : "#1e1e1e"}`,
                        color: active ? s.color : "#666",
                        transition: "all 0.15s",
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Prioridad">
              <div className="flex gap-1.5 flex-wrap">
                {PRIORITIES.map((p) => {
                  const active = priority === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { markDirty(); setPriority(p.id); }}
                      style={{
                        fontSize: 12,
                        padding: "6px 14px",
                        borderRadius: 100,
                        background: active ? p.bg : "transparent",
                        border: `1px solid ${active ? p.border : "#1e1e1e"}`,
                        color: active ? p.color : "#666",
                        transition: "all 0.15s",
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Proyecto">
              <select
                value={projectId}
                onChange={(e) => { markDirty(); setProjectId(e.target.value); }}
                className="w-full focus:outline-none"
                style={fieldStyle(!!projectId)}
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { markDirty(); setStartDate(e.target.value); }}
                  className="w-full focus:outline-none"
                  style={{ ...fieldStyle(!!startDate), colorScheme: "dark" }}
                />
              </Field>
              <Field label="Término">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { markDirty(); setDueDate(e.target.value); }}
                  className="w-full focus:outline-none"
                  style={{ ...fieldStyle(!!dueDate), colorScheme: "dark" }}
                />
              </Field>
            </div>

            <Field label="Descripción">
              <textarea
                value={description}
                onChange={(e) => { markDirty(); setDescription(e.target.value); }}
                placeholder="Notas, contexto, enlaces…"
                rows={8}
                className="w-full focus:outline-none resize-none"
                style={{ ...fieldStyle(!!description), minHeight: 200, lineHeight: 1.6 }}
              />
            </Field>
          </div>
        </div>
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function fieldStyle(hasValue: boolean): React.CSSProperties {
  return {
    fontSize: 13,
    color: hasValue ? "#eaeaea" : "#666",
    background: "#0d0d0d",
    border: "1px solid #1e1e1e",
    borderRadius: 8,
    padding: "10px 14px",
  };
}
