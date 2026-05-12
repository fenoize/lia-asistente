import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EditableTask = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  project_id: string | null;
  status: string;
};

type ProjectOption = { id: string; name: string };

const PRIORITIES: { id: string; label: string; color: string; bg: string; border: string }[] = [
  { id: "urgent", label: "Urgente", color: "#f87171", bg: "rgba(220,38,38,0.15)", border: "rgba(220,38,38,0.35)" },
  { id: "high", label: "Alta", color: "#fb923c", bg: "rgba(234,88,12,0.15)", border: "rgba(234,88,12,0.35)" },
  { id: "medium", label: "Media", color: "#fbbf24", bg: "rgba(217,119,6,0.15)", border: "rgba(217,119,6,0.35)" },
  { id: "low", label: "Baja", color: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.25)" },
];

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
  const [dueDate, setDueDate] = useState(
    task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : "",
  );
  const [projectId, setProjectId] = useState<string>(task.project_id ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const patch = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      project_id: projectId || null,
    };
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved({ ...task, ...patch });
    onClose();
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "100%",
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre de la tarea"
          className="w-full bg-transparent focus:outline-none"
          style={{
            fontSize: 16,
            color: "#eaeaea",
            border: "none",
            borderBottom: "1px solid #1e1e1e",
            padding: "6px 0 10px",
            marginBottom: 18,
          }}
        />

        <Field label="Proyecto">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
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

        <Field label="Prioridad">
          <div className="flex gap-1.5 flex-wrap">
            {PRIORITIES.map((p) => {
              const active = priority === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPriority(p.id)}
                  style={{
                    fontSize: 12,
                    padding: "5px 14px",
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

        <Field label="Fecha límite">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full focus:outline-none"
            style={{ ...fieldStyle(!!dueDate), colorScheme: "dark" }}
          />
        </Field>

        <Field label="Descripción">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notas adicionales..."
            rows={3}
            className="w-full focus:outline-none resize-none"
            style={fieldStyle(!!description)}
          />
        </Field>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={remove}
            style={{ fontSize: 12, color: "#f87171", cursor: "pointer", background: "transparent" }}
          >
            Eliminar tarea
          </button>
          <div className="flex items-center gap-2">
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
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || !title.trim()}
              style={{
                fontSize: 13,
                color: "white",
                background: "#6366f1",
                borderRadius: 100,
                padding: "7px 16px",
                fontWeight: 500,
                opacity: busy || !title.trim() ? 0.5 : 1,
              }}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
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
