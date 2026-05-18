import { useEffect, useMemo, useRef, useState } from "react";
import { IconArrowUp, IconBell, IconCalendarEvent, IconCircleCheck, IconPencil } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { useChatStore, type ChatAction as Action, type ChatMsg as Msg } from "@/hooks/use-chat-store";
import { supabase } from "@/integrations/supabase/client";
import { MentionInput, type MentionInputHandle } from "@/components/mentions/mention-input";
import { MentionText } from "@/components/mentions/mention-text";
import { detectUserTimeZone, formatDateTimeInTimeZone, toUTCISOString } from "@/lib/timezone";

const SUGGESTIONS = [
  "¿Qué debería hacer ahora?",
  "¿Tengo reuniones mañana?",
  "¿Qué tareas están atrasadas?",
  "Estoy colapsado, ayúdame",
  "Reorganiza mi tarde",
  "¿Cómo voy financieramente?",
];

const ACTION_RE = /```action\s*([\s\S]*?)```/i;

function parseAction(text: string): { clean: string; action: Action | null } {
  const m = text.match(ACTION_RE);
  if (!m) return { clean: text, action: null };
  try {
    const action = JSON.parse(m[1].trim()) as Action;
    return { clean: text.replace(ACTION_RE, "").trim(), action };
  } catch {
    return { clean: text.replace(ACTION_RE, "").trim(), action: null };
  }
}

export function ChatInterface() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const { messages, setMessages, loadedForUser } = useChatStore();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [name, setName] = useState("");
  const [userTimeZone, setUserTimeZone] = useState("America/Santiago");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<MentionInputHandle>(null);
  const contextRef = useRef<any>({});

  useEffect(() => {
    setUserTimeZone(detectUserTimeZone());
  }, []);

  // Load history + context once per user (kept in memory across navigations)
  useEffect(() => {
    if (!user) return;
    const alreadyLoaded = loadedForUser.current === user.id;
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const tasks: any[] = [
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase.from("tasks").select("title,due_date,priority,status").eq("status", "pending").limit(20),
        supabase.from("meetings").select("title,datetime").gte("datetime", startOfDay.toISOString()).order("datetime").limit(15),
        supabase.from("reminders").select("title,datetime,done").eq("done", false).gte("datetime", startOfDay.toISOString()).limit(15),
      ];
      if (!alreadyLoaded) {
        tasks.unshift(
          supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(20),
        );
      }
      const results = await Promise.all(tasks);
      const offset = alreadyLoaded ? 0 : 1;
      const history = alreadyLoaded ? null : results[0];
      const profile = results[offset];
      const t = results[offset + 1];
      const m = results[offset + 2];
      const r = results[offset + 3];

      if (history?.data) {
        setMessages(history.data.map((row: any) => {
          const parsed = row.role === "assistant" ? parseAction(row.content) : { clean: row.content, action: null };
          return {
            id: row.id,
            role: row.role,
            content: parsed.clean,
            action: parsed.action,
            actionStatus: row.metadata?.actionStatus ?? (parsed.action ? "pending" : undefined),
            createdAt: new Date(row.created_at).getTime(),
          };
        }));
        loadedForUser.current = user.id;
      }
      setName((profile.data?.name ?? "").split(" ")[0] || "");
      contextRef.current = {
        name: profile.data?.name ?? "",
        now: new Date().toISOString(),
        tasks: t.data ?? [],
        meetings: m.data ?? [],
        reminders: r.data ?? [],
      };
    })();
  }, [user, loadedForUser, setMessages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // (auto-resize handled inside MentionInput)

  const sendText = async (text: string) => {
    if (!text.trim() || !user || streaming) return;
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      createdAt: Date.now(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);

    void supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "user",
      content: userMsg.content,
    }).then(({ error }) => { if (error) console.error("save user msg", error); });

    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          timezone: userTimeZone,
          messages: next.slice(-20).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        let msg = "AI error";
        try { msg = JSON.parse(errText).error ?? msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        // Strip action block live so it doesn't flicker into view
        const display = raw.includes("```action") ? raw.split("```action")[0].trimEnd() : raw;
        setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: display } : msg));
      }
      const { clean, action } = parseAction(raw);
      setMessages((m) => m.map((msg) => msg.id === assistantId
        ? { ...msg, content: clean, action, actionStatus: action ? "pending" : undefined }
        : msg));

      void supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: raw,
        metadata: action ? { actionStatus: "pending" } : null,
      } as any).then(({ error }) => { if (error) console.error("save assistant msg", error); });
    } catch {
      toast.error(`${assistant.name} no pudo responder.`);
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
    } finally {
      setStreaming(false);
    }
  };

  const confirmAction = async (msgId: string, action: Action) => {
    if (!user) return;
    try {
      const dt = toUTCISOString(action.datetime ?? null, userTimeZone, { treatZuluAsLocal: true });
      if (action.type === "task") {
        await supabase.from("tasks").insert({
          user_id: user.id,
          title: action.title,
          description: action.description ?? null,
          priority: action.priority ?? "medium",
          due_date: dt,
        });
      } else if (action.type === "meeting") {
        await supabase.from("meetings").insert({
          user_id: user.id,
          title: action.title,
          datetime: dt ?? new Date().toISOString(),
          duration_minutes: action.duration_minutes ?? 60,
          notes: action.description ?? null,
        });
      } else if (action.type === "reminder") {
        await supabase.from("reminders").insert({
          user_id: user.id,
          title: action.title,
          datetime: dt ?? new Date().toISOString(),
        });
      } else {
        await supabase.from("notes").insert({
          user_id: user.id,
          content: action.description || action.title,
          type: "note",
        });
      }
      setMessages((m) => m.map((x) => x.id === msgId ? { ...x, actionStatus: "accepted" } : x));
      toast.success("Listo.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const declineAction = (msgId: string) => {
    setMessages((m) => m.map((x) => x.id === msgId ? { ...x, actionStatus: "declined" } : x));
  };

  const isEmpty = messages.length === 0;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 w-full" style={{ background: "var(--bg-base)" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full" style={{ maxWidth: 680, padding: "24px 24px 16px" }}>
          {isEmpty && (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ minHeight: "60vh" }}
            >
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  color: "#f2f2f2",
                  lineHeight: 1.15,
                }}
              >
                {greeting}{name ? `, ${name}` : ""}.
              </h2>
              <p style={{ marginTop: 6, fontSize: 15, color: "#555" }}>
                ¿En qué te ayudo{name ? `, ${name}` : ""}?
              </p>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((m, idx) => {
              const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={m.id}>
                  {m.role === "user" ? (
                    <UserBubble text={m.content} time={time} />
                  ) : (
                    <AlfredBubble
                      text={m.content}
                      time={time}
                      streaming={streaming && idx === messages.length - 1 && !m.action}
                      action={m.action ?? null}
                      actionStatus={m.actionStatus}
                      onConfirm={() => m.action && confirmAction(m.id, m.action)}
                      onDecline={() => declineAction(m.id)}
                      assistantInitial={assistant.name.charAt(0).toUpperCase()}
                    />
                  )}
                </div>
              );
            })}
            {streaming && messages[messages.length - 1]?.role === "user" && (
              <AlfredBubble text="" streaming action={null} assistantInitial={assistant.name.charAt(0).toUpperCase()} />
            )}
          </div>
        </div>
      </div>

      {/* Suggestions + input */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="mx-auto w-full" style={{ maxWidth: 680, padding: "12px 24px 16px" }}>
          {isEmpty && (
            <div
              className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-thin"
              style={{ scrollbarWidth: "thin" }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendText(s)}
                  className="shrink-0 transition-colors"
                  style={{
                    fontSize: 12,
                    border: "1px solid #222",
                    borderRadius: 100,
                    padding: "7px 16px",
                    color: "#888",
                    background: "#111",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
                    e.currentTarget.style.color = "#818cf8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#222";
                    e.currentTarget.style.color = "#888";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <InputBar
            taRef={taRef}
            value={input}
            onChange={setInput}
            onSend={() => sendText(input)}
            disabled={streaming}
            placeholder={`Pregúntale algo a ${assistant.name}...`}
          />
        </div>
      </div>
    </div>
  );
}

function UserBubble({ text, time }: { text: string; time?: string }) {
  return (
    <div className="flex flex-col items-end">
      <div
        style={{
          maxWidth: "75%",
          background: "var(--accent-subtle)",
          border: "1px solid oklch(0.58 0.22 295 / 25%)",
          borderRadius: "18px 18px 4px 18px",
          padding: "10px 16px",
          fontSize: 14,
          color: "var(--text-primary)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}
      >
        <MentionText text={text} />
      </div>
      {time && (
        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, marginRight: 4 }}>
          {time}
        </div>
      )}
    </div>
  );
}

function AlfredBubble({
  text,
  time,
  streaming,
  action,
  actionStatus,
  onConfirm,
  onDecline,
  assistantInitial,
}: {
  text: string;
  time?: string;
  streaming: boolean;
  action: Action | null;
  actionStatus?: "pending" | "accepted" | "declined";
  onConfirm?: () => void;
  onDecline?: () => void;
  assistantInitial?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "var(--accent-subtle)",
          color: "var(--accent-color)",
          fontWeight: 600,
          fontSize: 11,
          marginTop: 2,
        }}
      >
        {assistantInitial ?? "A"}
      </div>
      <div className="flex-1 min-w-0">
        <div
          style={{
            maxWidth: "85%",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "4px 18px 18px 18px",
            padding: "12px 16px",
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--text-primary)",
          }}
        >
          {text || streaming ? (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5">
              {text ? <ReactMarkdown>{text}</ReactMarkdown> : null}
              {streaming && (
                <span
                  className="inline-block ml-0.5 align-baseline"
                  style={{
                    width: 7,
                    height: 14,
                    background: "var(--accent-color)",
                    animation: "alfredBlinkChat 1s step-end infinite",
                    verticalAlign: "-2px",
                  }}
                />
              )}
              {!text && streaming && <TypingDots />}
            </div>
          ) : null}
        </div>
        {action && (
          <ActionCard
            action={action}
            status={actionStatus ?? "pending"}
            onConfirm={onConfirm!}
            onDecline={onDecline!}
          />
        )}
        {time && !streaming && (
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, marginLeft: 4 }}>
            {time}
          </div>
        )}
        <style>{`@keyframes alfredBlinkChat { 50% { opacity: 0; } }`}</style>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 py-1" aria-label="Escribiendo">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--text-tertiary)",
            animation: `alfredDot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`
        @keyframes alfredDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

const TYPE_META: Record<Action["type"], { label: string; Icon: typeof IconCircleCheck }> = {
  task: { label: "Crear tarea", Icon: IconCircleCheck },
  meeting: { label: "Agendar reunión", Icon: IconCalendarEvent },
  reminder: { label: "Crear recordatorio", Icon: IconBell },
  note: { label: "Guardar nota", Icon: IconPencil },
};

function ActionCard({
  action,
  status,
  onConfirm,
  onDecline,
}: {
  action: Action;
  status: "pending" | "accepted" | "declined";
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const meta = TYPE_META[action.type];
  const Icon = meta.Icon;
  return (
    <div
      style={{
        marginTop: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--accent-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} stroke={1.75} style={{ color: "var(--accent-color)" }} />
        <span style={{ fontSize: 11, color: "var(--accent-color)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          {meta.label}
        </span>
      </div>
      <p style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
        {action.title}
      </p>
      {action.datetime && (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {new Date(action.datetime).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
      {action.description && (
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          {action.description}
        </p>
      )}

      {status === "pending" ? (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onConfirm}
            style={{
              background: "var(--accent-color)",
              color: "white",
              borderRadius: "var(--radius-pill)",
              padding: "6px 16px",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Sí, crear
          </button>
          <button
            onClick={onDecline}
            style={{
              background: "transparent",
              color: "var(--text-tertiary)",
              padding: "6px 12px",
              fontSize: 13,
            }}
          >
            No, gracias
          </button>
        </div>
      ) : (
        <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
          {status === "accepted" ? "✓ Creado." : "Descartado."}
        </p>
      )}
    </div>
  );
}

function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  taRef,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  taRef: React.RefObject<MentionInputHandle | null>;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const hasText = value.trim().length > 0;
  return (
    <div
      className="flex items-end gap-2.5"
      style={{
        background: "#111111",
        border: `1px solid ${focused ? "rgba(99,102,241,0.5)" : "#222"}`,
        borderRadius: 14,
        padding: "14px 16px",
        transition: "border-color 0.15s",
      }}
    >
      <div
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "rgba(99,102,241,0.15)",
          color: "#818cf8",
          fontSize: 11,
          fontWeight: 600,
          marginBottom: 6,
        }}
        aria-hidden
      >
        A
      </div>
      <div className="flex-1 min-w-0">
        <MentionInput
          ref={taRef}
          value={value}
          onChange={onChange}
          onSubmit={() => { if (hasText && !disabled) onSend(); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          rows={1}
          maxRows={5}
          placeholder={placeholder ?? "Pregúntale algo a tu asistente..."}
          className="w-full bg-transparent resize-none focus:outline-none alfred-chat-input"
          style={{
            fontSize: 14,
            lineHeight: "22px",
            color: "var(--text-primary)",
            minHeight: 22,
            border: "none",
            outline: "none",
          }}
        />
      </div>
      <button
        onClick={onSend}
        disabled={!hasText || disabled}
        aria-label="Enviar"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: hasText ? "#6366f1" : "#1a1a1a",
          color: hasText ? "white" : "#555",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <IconArrowUp size={16} stroke={2.25} />
      </button>
    </div>
  );
}

