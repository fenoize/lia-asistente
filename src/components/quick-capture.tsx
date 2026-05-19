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
import { ChevronDown, Loader2, X, RotateCw, Pencil } from "lucide-react";
import {
  detectUserTimeZone,
  localInputsToUTCISOString,
  nextDateAtLocal,
  toDateInputs,
  toUTCISOString,
} from "@/lib/timezone";

type CaptureType = "task" | "meeting" | "reminder" | "note" | "idea" | "project";

const typeMeta: Record<CaptureType, { label: string; emoji: string }> = {
  task: { label: "Tarea", emoji: "📋" },
  meeting: { label: "Reunión", emoji: "📅" },
  reminder: { label: "Recordatorio", emoji: "🔔" },
  note: { label: "Nota", emoji: "📝" },
  idea: { label: "Idea", emoji: "💡" },
  project: { label: "Proyecto", emoji: "🚀" },
};

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

function detectType(raw: string): CaptureType {
  const t = raw.toLowerCase().trim();
  if (!t) return "task";
  if (/(proyecto|nuevo proyecto)/.test(t)) return "project";
  if (/(reuni[oó]n|llama|llamada|\bcall\b|meeting|junta)/.test(t)) return "meeting";
  if (/(recu[eé]rdame|recordar|recordatorio|ma[ñn]ana a las|hoy a las)/.test(t)) return "reminder";
  if (TIME_RE.test(t)) return "reminder";
  if (/(idea[: ]|💡|brainstorm)/.test(t)) return "idea";
  if (t.length > 90) return "note";
  return "task";
}

function parseDateTime(raw: string): string | null {
  try {
    const t = raw.toLowerCase();
    const m = t.match(TIME_RE);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (!isFinite(h) || h < 0 || h > 23 || !isFinite(min) || min < 0 || min > 59) return null;
    const ap = m[3];
    if (ap) {
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
    }
    const days = /ma[ñn]ana/.test(t) ? 1 : 0;
    const iso = nextDateAtLocal(h, min, days);
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return iso;
  } catch {
    return null;
  }
}

type Snapshot = {
  text: string;
  manualType: CaptureType | null;
  priority: "urgent" | "high" | "medium" | "low";
  noteKind: "note" | "idea" | "highlight";
  dt: { date: string; time: string };
  dtTouched: boolean;
};

type Pending = {
  id: number;
  snapshot: Snapshot;
  status: "queued" | "committing" | "error";
  error?: string;
  countdown: number;
};

export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<"urgent" | "high" | "medium" | "low">("medium");
  const [noteKind, setNoteKind] = useState<"note" | "idea" | "highlight">("note");
  const [dt, setDt] = useState<{ date: string; time: string }>(toDateInputs(null));
  const [dtTouched, setDtTouched] = useState(false);
  const [manualType, setManualType] = useState<CaptureType | null>(null);
  const [userTimeZone, setUserTimeZone] = useState("America/Santiago");
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<MentionInputHandle>(null);
  const { user } = useAuth();

  const autoDetected = useMemo(() => detectType(text), [text]);
  const detected = manualType ?? autoDetected;

  useEffect(() => {
    setUserTimeZone(detectUserTimeZone());
  }, []);

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
    const opener = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: CaptureType } | undefined;
      if (detail?.type) setManualType(detail.type);
      setClosing(false);
      setOpen(true);
    };
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
    if (iso) {
      try {
        setDt(toDateInputs(iso, userTimeZone));
      } catch {
        // ignore — invalid date, leave defaults
      }
    }
  }, [text, dtTouched, userTimeZone]);

  function resetForm(opts?: { keep?: Snapshot }) {
    if (opts?.keep) {
      const s = opts.keep;
      setText(s.text);
      setManualType(s.manualType);
      setPriority(s.priority);
      setNoteKind(s.noteKind);
      setDt(s.dt);
      setDtTouched(s.dtTouched);
    } else {
      setText("");
      setPriority("medium");
      setNoteKind("note");
      setDt(toDateInputs(null, userTimeZone));
      setDtTouched(false);
      setManualType(null);
    }
  }

  function close() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      resetForm();
    }, 160);
  }

  function reopenWith(snapshot: Snapshot) {
    setClosing(false);
    setOpen(true);
    resetForm({ keep: snapshot });
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function clearPendingTimers() {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  function cancelPending() {
    clearPendingTimers();
    setPending(null);
  }

  async function commit(snapshot: Snapshot) {
    if (!user) return;
    setPending((p) => (p ? { ...p, status: "committing" } : p));
    try {
      const priorityMap = { urgent: "high", high: "high", medium: "medium", low: "low" } as const;

      let ai: {
        type: "task" | "meeting" | "reminder" | "note" | "project";
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
          body: JSON.stringify({ text: snapshot.text, timezone: userTimeZone }),
        });
        if (res.ok) ai = await res.json();
      } catch {
        // fall back
      }

      const localDetected = detectType(snapshot.text);
      const type = snapshot.manualType ?? ai?.type ?? localDetected;
      const fallbackTitle = snapshot.text.trim().split("\n")[0].slice(0, 140);
      const title = (ai?.title?.trim() || fallbackTitle).slice(0, 200);
      const description = ai?.description?.trim() || (snapshot.text.length > title.length ? snapshot.text : null);
      const userOverrideDt = snapshot.dtTouched
        ? localInputsToUTCISOString(snapshot.dt.date, snapshot.dt.time, userTimeZone)
        : null;
      const aiDt = toUTCISOString(ai?.datetime ?? null, userTimeZone, { treatZuluAsLocal: true });
      const fallbackDt = localInputsToUTCISOString(snapshot.dt.date, snapshot.dt.time, userTimeZone);
      const datetime = userOverrideDt || aiDt || fallbackDt;

      if (type === "task") {
        const { error } = await supabase.from("tasks").insert({
          user_id: user.id,
          title,
          description,
          priority: ai?.priority ?? priorityMap[snapshot.priority],
          due_date: userOverrideDt || aiDt || null,
        });
        if (error) throw error;
      } else if (type === "meeting") {
        const { error } = await supabase.from("meetings").insert({
          user_id: user.id,
          title,
          datetime,
          notes: description,
          duration_minutes: ai?.duration_minutes ?? 60,
        });
        if (error) throw error;
      } else if (type === "reminder") {
        const { error } = await supabase.from("reminders").insert({
          user_id: user.id,
          title,
          datetime,
        });
        if (error) throw error;
      } else if (type === "project") {
        const { error } = await supabase.from("projects").insert({
          user_id: user.id,
          name: title,
          notes: description,
          due_date: userOverrideDt || aiDt || null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notes").insert({
          user_id: user.id,
          content: description || snapshot.text,
          type: type === "note" && (snapshot.noteKind === "idea" || snapshot.noteKind === "highlight") ? snapshot.noteKind : "note",
        });
        if (error) throw error;
      }

      toast.success("Guardado", { description: title });
      setPending(null);
    } catch (e: any) {
      setPending((p) =>
        p ? { ...p, status: "error", error: e?.message ?? "No se pudo guardar" } : p,
      );
    }
  }

  function queueSave() {
    if (!text.trim() || !user) return;
    const snapshot: Snapshot = {
      text,
      manualType,
      priority,
      noteKind,
      dt,
      dtTouched,
    };

    // Close modal immediately (optimistic)
    close();

    // Replace any existing pending
    clearPendingTimers();
    const id = Date.now();
    const COUNTDOWN_SECS = 3;
    setPending({ id, snapshot, status: "queued", countdown: COUNTDOWN_SECS });

    countdownRef.current = setInterval(() => {
      setPending((p) =>
        p && p.id === id && p.status === "queued"
          ? { ...p, countdown: Math.max(0, p.countdown - 1) }
          : p,
      );
    }, 1000);

    pendingTimerRef.current = setTimeout(() => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      commit(snapshot);
    }, COUNTDOWN_SECS * 1000);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPendingTimers();
  }, []);

  const meta = typeMeta[detected];
  const showDateTime = detected === "meeting" || detected === "reminder" || detected === "project";

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
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
            <MentionInput
              ref={inputRef}
              value={text}
              onChange={setText}
              onSubmit={queueSave}
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

            {text.trim() && (
              <div style={{ padding: "0 24px 12px" }}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="inline-flex items-center gap-1.5 outline-none hover:opacity-80 transition-opacity"
                      style={{
                        background: "var(--accent-subtle)",
                        color: "var(--accent-color)",
                        border: "1px solid rgba(99,102,241,0.3)",
                        borderRadius: "var(--radius-pill)",
                        padding: "4px 10px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      <span>{meta.emoji}</span> {meta.label}
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-40 border-border bg-background">
                    {(Object.keys(typeMeta) as CaptureType[]).map((t) => (
                      <DropdownMenuItem
                        key={t}
                        onClick={() => setManualType(t)}
                        className="gap-2 cursor-pointer"
                      >
                        <span>{typeMeta[t].emoji}</span>
                        <span>{typeMeta[t].label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--border-subtle)" }} />

            <div
              style={{
                padding: "14px 24px",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
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

            <div className="flex items-center justify-between" style={{ padding: "12px 24px" }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                ↵ Guardar  ·  esc Cerrar
              </span>
              <button
                onClick={queueSave}
                disabled={!text.trim()}
                style={{
                  fontSize: 12,
                  padding: "6px 14px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--accent-color)",
                  color: "white",
                  border: "none",
                  opacity: !text.trim() ? 0.5 : 1,
                  cursor: !text.trim() ? "not-allowed" : "pointer",
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optimistic pending chip */}
      {pending && (
        <div
          className="fixed z-[60] flex items-center gap-2"
          style={{
            bottom: 24,
            right: 24,
            maxWidth: 360,
            padding: "10px 12px",
            borderRadius: "var(--radius-pill)",
            background: pending.status === "error" ? "#3d1515" : "var(--bg-elevated)",
            border: `1px solid ${pending.status === "error" ? "#7a2a2a" : "var(--border)"}`,
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5)",
            color: "var(--text-primary)",
            fontSize: 12,
            animation: "alfredQcIn 180ms ease",
          }}
        >
          {pending.status === "error" ? (
            <span style={{ color: "#f87171", flexShrink: 0 }}>⚠</span>
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ flexShrink: 0, color: "var(--accent-color)" }} />
          )}
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 200,
            }}
            title={pending.snapshot.text}
          >
            {pending.snapshot.text}
          </span>

          {pending.status === "queued" && (
            <button
              onClick={cancelPending}
              className="inline-flex items-center gap-1 hover:opacity-80"
              style={{
                padding: "3px 8px",
                borderRadius: "var(--radius-pill)",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              <X className="h-3 w-3" />
              Cancelar {pending.countdown > 0 ? `(${pending.countdown}s)` : ""}
            </button>
          )}

          {pending.status === "error" && (
            <>
              <button
                onClick={() => commit(pending.snapshot)}
                className="inline-flex items-center gap-1 hover:opacity-80"
                style={{
                  padding: "3px 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--accent-color)",
                  color: "white",
                  border: "none",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                <RotateCw className="h-3 w-3" />
                Reintentar
              </button>
              <button
                onClick={() => {
                  const snap = pending.snapshot;
                  cancelPending();
                  reopenWith(snap);
                }}
                className="inline-flex items-center gap-1 hover:opacity-80"
                style={{
                  padding: "3px 8px",
                  borderRadius: "var(--radius-pill)",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
                title="Editar"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
