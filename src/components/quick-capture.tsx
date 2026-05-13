import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MentionInput, type MentionInputHandle } from "@/components/mentions/mention-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type CaptureType = "task" | "meeting" | "reminder" | "note" | "idea";

const typeMeta: Record<CaptureType, { label: string; emoji: string }> = {
  task: { label: "Tarea", emoji: "📋" },
  meeting: { label: "Reunión", emoji: "📅" },
  reminder: { label: "Recordatorio", emoji: "🔔" },
  note: { label: "Nota", emoji: "📝" },
  idea: { label: "Idea", emoji: "💡" },
};

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

function detectType(raw: string): CaptureType {
  const t = raw.toLowerCase().trim();
  if (!t) return "task";
  if (/(reuni[oó]n|llama|llamada|\bcall\b|meeting|junta)/.test(t)) return "meeting";
  if (/(recu[eé]rdame|recordar|recordatorio|ma[ñn]ana a las|hoy a las)/.test(t)) return "reminder";
  if (TIME_RE.test(t)) return "reminder";
  if (/(idea[: ]|💡|brainstorm)/.test(t)) return "idea";
  if (t.length > 90) return "note";
  return "task";
}

function nextDateAt(hour: number, minute: number, daysAhead = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function parseDateTime(raw: string): string | null {
  const t = raw.toLowerCase();
  const m = t.match(TIME_RE);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap) {
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  const days = /ma[ñn]ana/.test(t) ? 1 : 0;
  return nextDateAt(h, min, days).toISOString();
}

function toDateInputs(iso: string | null): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function fromDateInputs(date: string, time: string): string {
  return new Date(`${date}T${time || "09:00"}`).toISOString();
}

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [priority, setPriority] = useState<"urgent" | "high" | "medium" | "low">("medium");
  const [noteKind, setNoteKind] = useState<"note" | "idea" | "highlight">("note");
  const [dt, setDt] = useState<{ date: string; time: string }>(toDateInputs(null));
  const [dtTouched, setDtTouched] = useState(false);
  const inputRef = useRef<MentionInputHandle>(null);
  const { user } = useAuth();

  const detected = useMemo(() => detectType(text), [text]);

  // Open via custom event or ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setClosing(false);
        setOpen(true);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    const opener = () => { setClosing(false); setOpen(true); };
    window.addEventListener("keydown", handler);
    window.addEventListener("alfred:quick-capture", opener);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("alfred:quick-capture", opener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Auto-fill datetime from text when not manually edited
  useEffect(() => {
    if (dtTouched) return;
    const iso = parseDateTime(text);
    if (iso) setDt(toDateInputs(iso));
  }, [text, dtTouched]);

  function close() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setText("");
      setBusy(false);
      setPriority("medium");
      setNoteKind("note");
      setDt(toDateInputs(null));
      setDtTouched(false);
    }, 160);
  }

  async function save() {
    if (!user || !text.trim()) return;
    setBusy(true);
    try {
      const priorityMap = { urgent: "high", high: "high", medium: "medium", low: "low" } as const;

      // Try AI parsing first for better title/description/datetime extraction
      let ai: {
        type: "task" | "meeting" | "reminder" | "note";
        title: string;
        description?: string | null;
        datetime?: string | null;
        priority?: "low" | "medium" | "high" | null;
        duration_minutes?: number | null;
      } | null = null;
      try {
        const res = await fetch("/api/quick-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) ai = await res.json();
      } catch {
        // fall back to local heuristics
      }

      const type = ai?.type ?? detected;
      const fallbackTitle = text.trim().split("\n")[0].slice(0, 140);
      const title = (ai?.title?.trim() || fallbackTitle).slice(0, 200);
      const description = ai?.description?.trim() || (text.length > title.length ? text : null);
      const userOverrideDt = dtTouched ? fromDateInputs(dt.date, dt.time) : null;
      const datetime = userOverrideDt || ai?.datetime || fromDateInputs(dt.date, dt.time);

      if (type === "task") {
        await supabase.from("tasks").insert({
          user_id: user.id,
          title,
          description,
          priority: ai?.priority ?? priorityMap[priority],
          due_date: userOverrideDt || ai?.datetime || null,
        });
      } else if (type === "meeting") {
        await supabase.from("meetings").insert({
          user_id: user.id,
          title,
          datetime,
          notes: description,
          duration_minutes: ai?.duration_minutes ?? 60,
        });
      } else if (type === "reminder") {
        await supabase.from("reminders").insert({
          user_id: user.id,
          title,
          datetime,
        });
      } else {
        await supabase.from("notes").insert({
          user_id: user.id,
          content: description || text,
          type: type === "note" && (noteKind === "idea" || noteKind === "highlight") ? noteKind : "note",
        });
      }

      toast.success("Guardado", { description: title });
      close();
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo guardar");
      setBusy(false);
    }
  }


  if (!open) return null;

  const meta = typeMeta[detected];
  const showDateTime = detected === "meeting" || detected === "reminder";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: closing ? "alfredQcOut 160ms ease forwards" : "alfredQcIn 180ms ease",
      }}
    >
      <div
        className="w-[520px] max-w-[92vw] flex flex-col"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
          transform: closing ? "scale(0.96)" : "scale(1)",
          opacity: closing ? 0 : 1,
          transition: "transform 160ms ease, opacity 160ms ease",
        }}
      >
        {/* Input */}
        <MentionInput
          ref={inputRef}
          value={text}
          onChange={setText}
          onSubmit={save}
          placeholder="¿Qué quieres capturar?"
          autoFocus
          className="bg-transparent border-0 outline-none w-full"
          style={{
            padding: "20px 24px",
            fontSize: 18,
            color: "var(--text-primary)",
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        />

        {/* Type chip */}
        {text.trim() && (
          <div style={{ padding: "0 24px 12px" }}>
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent-color)",
                border: "1px solid rgba(99,102,241,0.3)",
                borderRadius: "var(--radius-pill)",
                padding: "4px 10px",
                fontSize: 13,
              }}
            >
              <span>{meta.emoji}</span> {meta.label}
            </span>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

        {/* Smart fields */}
        <div style={{ padding: "14px 24px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {detected === "task" && (
            <>
              <div className="flex items-center gap-1.5">
                {(["urgent", "high", "medium", "low"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid var(--border)",
                      background: priority === p ? "var(--accent-subtle)" : "transparent",
                      color: priority === p ? "var(--accent-color)" : "var(--text-secondary)",
                    }}
                  >
                    {p === "urgent" ? "Urgente" : p === "high" ? "Alta" : p === "medium" ? "Media" : "Baja"}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={dt.date}
                onChange={(e) => { setDt({ ...dt, date: e.target.value }); setDtTouched(true); }}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "4px 8px",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  colorScheme: "dark",
                }}
              />
            </>
          )}

          {showDateTime && (
            <>
              <input
                type="date"
                value={dt.date}
                onChange={(e) => { setDt({ ...dt, date: e.target.value }); setDtTouched(true); }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 10px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  colorScheme: "dark",
                }}
              />
              <input
                type="time"
                value={dt.time}
                onChange={(e) => { setDt({ ...dt, time: e.target.value }); setDtTouched(true); }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "6px 10px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  colorScheme: "dark",
                }}
              />
            </>
          )}

          {(detected === "note" || detected === "idea") && (
            <div className="flex items-center gap-1.5">
              {(["note", "idea", "highlight"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setNoteKind(k)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--border)",
                    background: noteKind === k ? "var(--accent-subtle)" : "transparent",
                    color: noteKind === k ? "var(--accent-color)" : "var(--text-secondary)",
                  }}
                >
                  {k === "note" ? "Nota" : k === "idea" ? "Idea" : "Highlight"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

        {/* Footer */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "12px 24px" }}
        >
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            ↵ Guardar  ·  esc Cerrar
          </span>
          <button
            onClick={save}
            disabled={busy || !text.trim()}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              background: "var(--accent-color)",
              color: "white",
              border: "none",
              opacity: busy || !text.trim() ? 0.5 : 1,
              cursor: busy || !text.trim() ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
