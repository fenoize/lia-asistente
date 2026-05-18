import { useState, type CSSProperties, type ReactNode } from "react";
import { IconX, IconTrash } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { detectUserTimeZone, formatDateTimeInTimeZone, localDateTimeToUTCISOString, toDateTimeLocalInput } from "@/lib/timezone";

export type EditableMeeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
};

export function EditMeetingModal({
  meeting,
  onClose,
  onSaved,
}: {
  meeting: EditableMeeting;
  onClose: () => void;
  onSaved: () => void;
}) {
  const userTimeZone = detectUserTimeZone();
  const [title, setTitle] = useState(meeting.title);
  const [datetime, setDatetime] = useState(toDateTimeLocalInput(meeting.datetime, userTimeZone));
  const [duration, setDuration] = useState<string>(meeting.duration_minutes?.toString() ?? "60");
  const [location, setLocation] = useState(meeting.location ?? "");
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [prep, setPrep] = useState(!!meeting.preparation_needed);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !datetime) return;
    setSaving(true);
    await supabase
      .from("meetings")
      .update({
        title: title.trim(),
          datetime: localDateTimeToUTCISOString(datetime, userTimeZone),
        duration_minutes: duration ? parseInt(duration, 10) : null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        preparation_needed: prep,
      })
      .eq("id", meeting.id);
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta reunión?")) return;
    setSaving(true);
    await supabase.from("meetings").delete().eq("id", meeting.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111", border: "1px solid #1e1e1e", borderRadius: 14,
          width: "100%", maxWidth: 480, padding: 24,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f2f2f2" }}>Editar reunión</h2>
          <button onClick={onClose} style={{ color: "#666" }}><IconX size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Fecha y hora">
            <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
              Hora local: {formatDateTimeInTimeZone(meeting.datetime, userTimeZone)}
            </div>
          </Field>
          <Field label="Duración (min)">
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Ubicación o link">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle} />
          </Field>
          <Field label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <label className="flex items-center gap-2" style={{ fontSize: 13, color: "#888" }}>
            <input type="checkbox" checked={prep} onChange={(e) => setPrep(e.target.checked)} />
            Requiere preparación
          </label>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button onClick={remove} disabled={saving} className="flex items-center gap-1.5"
            style={{ fontSize: 13, color: "#f87171", padding: "8px 12px", borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.2)", background: "rgba(220,38,38,0.08)" }}>
            <IconTrash size={14} /> Eliminar
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} style={{ fontSize: 13, color: "#888", padding: "8px 14px", borderRadius: 8, border: "1px solid #222", background: "transparent" }}>
              Cancelar
            </button>
            <button onClick={save} disabled={saving || !title.trim() || !datetime}
              style={{ fontSize: 13, color: "#fff", fontWeight: 500, padding: "8px 14px", borderRadius: 8, background: "#6366f1", opacity: saving || !title.trim() || !datetime ? 0.5 : 1 }}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  border: "1px solid #1e1e1e",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#e0e0e0",
  outline: "none",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
