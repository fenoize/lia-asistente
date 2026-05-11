import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IconPlus, IconMapPin, IconVideo, IconBolt } from "@tabler/icons-react";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";

export const Route = createFileRoute("/_app/meetings")({
  component: MeetingsPage,
});

type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function openCapture() {
  window.dispatchEvent(new CustomEvent("alfred:quick-capture"));
}

// Format Date -> "YYYY-MM-DDTHH:mm" for datetime-local input (local tz)
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [selected, setSelected] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
    }),
    [weekStart],
  );

  const load = async () => {
    if (!user) return;
    const start = new Date(weekStart);
    const end = new Date(weekStart); end.setDate(end.getDate() + 7);
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .gte("datetime", start.toISOString())
      .lt("datetime", end.toISOString())
      .order("datetime", { ascending: true });
    setMeetings((data as Meeting[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, weekStart]);

  const dayMeetings = useMemo(
    () => meetings.filter((m) => sameDay(new Date(m.datetime), selected)),
    [meetings, selected],
  );

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="alfred-h1">Reuniones</h1>
        <button onClick={openCapture} className="alfred-new-btn">
          <IconPlus size={14} /> Nueva reunión
        </button>
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {days.map((d, i) => {
          const isSel = sameDay(d, selected);
          return (
            <button
              key={i}
              onClick={() => setSelected(d)}
              className="flex-1 flex flex-col items-center"
              style={{
                gap: 4,
                padding: "10px 16px",
                borderRadius: 10,
                background: isSel ? "transparent" : "#111",
                border: isSel
                  ? "1px solid rgba(99,102,241,0.5)"
                  : "1px solid #1a1a1a",
                transition: "border-color 0.15s",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: isSel ? "#818cf8" : "#555",
                }}
              >
                {DAYS[i]}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: isSel ? 600 : 500,
                  color: isSel ? "#f2f2f2" : "#888",
                }}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Skeletons />
      ) : dayMeetings.length === 0 ? (
        <div className="text-center" style={{ padding: "80px 0" }}>
          <p style={{ fontSize: 14, color: "#333" }}>Sin reuniones este día.</p>
          <p style={{ fontSize: 13, color: "#2a2a2a", marginTop: 6 }}>
            Buen momento para ejecutar.
          </p>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayMeetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} onClick={() => setEditing(m)} />
          ))}
        </ul>
      )}

      {editing && (
        <EditMeetingModal
          meeting={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function MeetingCard({ meeting: m, onClick }: { meeting: Meeting; onClick: () => void }) {
  const t = new Date(m.datetime);
  const time = t.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isLink = !!m.location && /^https?:\/\//.test(m.location);

  return (
    <li
      onClick={onClick}
      style={{
        background: "#111111",
        border: "1px solid #1e1e1e",
        borderLeft: "3px solid #6366f1",
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.3)"; (e.currentTarget as HTMLElement).style.borderLeftColor = "#6366f1"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#1e1e1e"; (e.currentTarget as HTMLElement).style.borderLeftColor = "#6366f1"; }}
    >
      <div className="flex items-center gap-3 mb-1">
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#6366f1",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {time}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 500,
            color: "#e0e0e0",
          }}
        >
          {m.title}
        </span>
        {m.duration_minutes && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 10px",
              borderRadius: 100,
              background: "#1a1a1a",
              border: "1px solid #222",
              color: "#666",
            }}
          >
            {m.duration_minutes}m
          </span>
        )}
      </div>

      {m.location && (
        <div className="flex items-center gap-1.5 mt-1" style={{ fontSize: 12, color: "#555" }}>
          {isLink ? <IconVideo size={12} /> : <IconMapPin size={12} />}
          <span className="truncate">{m.location}</span>
        </div>
      )}

      {m.notes && (
        <p className="mt-2 truncate" style={{ fontSize: 12, color: "#555" }}>
          {m.notes}
        </p>
      )}

      {m.preparation_needed && (
        <span
          className="inline-flex items-center gap-1 mt-2"
          style={{
            fontSize: 11,
            padding: "2px 10px",
            borderRadius: 100,
            background: "rgba(251,146,60,0.14)",
            color: "#fdba74",
          }}
        >
          <IconBolt size={10} /> Requiere prep
        </span>
      )}
    </li>
  );
}

function EditMeetingModal({
  meeting,
  onClose,
  onSaved,
}: {
  meeting: Meeting;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(meeting.title);
  const [datetime, setDatetime] = useState(toLocalInputValue(new Date(meeting.datetime)));
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
        datetime: new Date(datetime).toISOString(),
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Fecha y hora">
            <input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Duración (min)">
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Ubicación o link">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="https://meet.google.com/..."
              style={inputStyle}
            />
          </Field>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <label className="flex items-center gap-2" style={{ fontSize: 13, color: "#888" }}>
            <input type="checkbox" checked={prep} onChange={(e) => setPrep(e.target.checked)} />
            Requiere preparación
          </label>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={remove}
            disabled={saving}
            className="flex items-center gap-1.5"
            style={{
              fontSize: 13, color: "#f87171",
              padding: "8px 12px", borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.2)",
              background: "rgba(220,38,38,0.08)",
            }}
          >
            <IconTrash size={14} /> Eliminar
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              style={{
                fontSize: 13, color: "#888",
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid #222", background: "transparent",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !title.trim() || !datetime}
              style={{
                fontSize: 13, color: "#fff", fontWeight: 500,
                padding: "8px 14px", borderRadius: 8,
                background: "#6366f1",
                opacity: saving || !title.trim() || !datetime ? 0.5 : 1,
              }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  border: "1px solid #1e1e1e",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "#e0e0e0",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 72,
            borderRadius: 12,
            background: "#111",
            opacity: 0.5,
            animation: "alfredShimmer 1.4s infinite",
          }}
        />
      ))}
    </div>
  );
}
