import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Reminder = {
  id: string;
  title: string;
  datetime: string;
  done: boolean | null;
};

function toInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function EditReminderModal({
  reminder,
  open,
  onClose,
  onSaved,
}: {
  reminder: Reminder | null;
  open: boolean;
  onClose: () => void;
  onSaved: (r: Reminder) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reminder) {
      setTitle(reminder.title);
      const i = toInputs(reminder.datetime);
      setDate(i.date);
      setTime(i.time);
    }
  }, [reminder]);

  if (!open || !reminder) return null;

  async function save() {
    if (!reminder || !title.trim()) return;
    setBusy(true);
    const datetime = new Date(`${date}T${time || "09:00"}`).toISOString();
    const { error } = await supabase
      .from("reminders")
      .update({ title: title.trim(), datetime })
      .eq("id", reminder.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSaved({ ...reminder, title: title.trim(), datetime });
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-[480px] max-w-[92vw]"
        style={{
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>
          Editar recordatorio
        </h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nombre del recordatorio"
          autoFocus
          style={{
            width: "100%",
            fontSize: 16,
            background: "transparent",
            border: "none",
            borderBottom: "1px solid #1e1e1e",
            padding: "8px 0",
            color: "var(--text-primary)",
            outline: "none",
            marginBottom: 20,
          }}
        />

        <div className="flex gap-2 mb-6">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #1e1e1e",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              color: "var(--text-primary)",
              colorScheme: "dark",
            }}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #1e1e1e",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              color: "var(--text-primary)",
              colorScheme: "dark",
            }}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy || !title.trim()}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              background: "var(--accent-color)",
              color: "white",
              border: "none",
              opacity: busy || !title.trim() ? 0.5 : 1,
            }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
