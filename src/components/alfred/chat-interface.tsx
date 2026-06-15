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

// Matches ```action, ```json or plain ``` code fences
const FENCE_RE = /```(?:action|json)?\s*([\s\S]*?)```/gi;
// Matches trailing/standalone raw JSON object or array (greedy to end)
const TRAILING_JSON_RE = /(?:^|\n)\s*([{\[][\s\S]*[}\]])\s*$/;


function isValidSingle(obj: any): obj is Action {
  return obj && typeof obj === "object"
    && typeof obj.type === "string"
    && ["task", "meeting", "reminder", "note", "task_update"].includes(obj.type)
    && typeof obj.title === "string";
}

function tryParseAction(raw: string): Action | null {
  try {
    const obj = JSON.parse(raw.trim());
    if (Array.isArray(obj)) {
      const items = obj.filter(isValidSingle);
      if (items.length === 0) return null;
      if (items.length === 1) return items[0];
      return { type: "bulk", title: "", items };
    }
    if (isValidSingle(obj)) return obj;
  } catch {}
  return null;
}


function stripJsonForDisplay(text: string): string {
  let out = text.replace(FENCE_RE, "").trim();
  // Preserve [PLAN]…[/PLAN] blocks so the weekly-plan card can render them.
  // Temporarily mask them, run trailing-JSON strip, then restore.
  const masks: string[] = [];
  out = out.replace(/\[PLAN\][\s\S]*?\[\/PLAN\]/g, (m) => {
    masks.push(m);
    return `\u0000PLAN${masks.length - 1}\u0000`;
  });
  const tm = out.match(TRAILING_JSON_RE);
  if (tm) out = out.slice(0, tm.index).trim();
  out = out.replace(/\u0000PLAN(\d+)\u0000/g, (_, i) => masks[Number(i)]);
  return out;
}

function parseAction(text: string): { clean: string; action: Action | null } {
  let action: Action | null = null;
  // Try fenced blocks first
  const fenceMatches = [...text.matchAll(FENCE_RE)];
  for (const m of fenceMatches) {
    const a = tryParseAction(m[1]);
    if (a) { action = a; break; }
  }
  // Try trailing raw JSON
  if (!action) {
    const tm = text.match(TRAILING_JSON_RE);
    if (tm) {
      const a = tryParseAction(tm[1]);
      if (a) action = a;
    }
  }
  return { clean: stripJsonForDisplay(text), action };
}

function stripPartialJsonForLive(raw: string): string {
  // Cut at first opening fence or first standalone JSON start.
  // IMPORTANT: do NOT cut on `[PLAN]` blocks — those render as WeeklyPlanCard.
  let cut = raw.length;
  const fence = raw.search(/```/);
  if (fence !== -1) cut = Math.min(cut, fence);
  // Match `[` or `{` at line start, but skip `[PLAN]` / `[/PLAN]` markers.
  const jsonRe = /(?:^|\n)\s*([{\[])/g;
  let m: RegExpExecArray | null;
  while ((m = jsonRe.exec(raw)) !== null) {
    if (m[1] === "[") {
      const rest = raw.slice(m.index + m[0].length - 1);
      if (/^\[\/?PLAN\]/.test(rest)) continue;
    }
    const idx = m.index + m[0].length - 1;
    cut = Math.min(cut, idx);
    break;
  }
  return raw.slice(0, cut).trimEnd();
}

// ─── Weekly Plan types & parser ──────────────────────────────────────────────
interface PlanTask {
  task_id: string | null;
  action: "update" | "create";
  title: string;
  priority: "urgente" | "alta" | "media" | "baja";
  start_time: string;
  duration_minutes: number;
  project_name: string | null;
}
interface PlanDay { date: string; label: string; tasks: PlanTask[]; }
interface WeeklyPlan { type: "weekly_plan"; summary: string; days: PlanDay[]; }
interface DragState {
  taskId: string; fromDayIdx: number; fromTaskIdx: number;
  title: string; active: boolean; targetDayIdx: number | null;
  startX: number; startY: number;
}

function parseMessageParts(content: string): Array<{ type: "text" | "plan"; value: string }> {
  const parts: Array<{ type: "text" | "plan"; value: string }> = [];
  const regex = /\[PLAN\]([\s\S]*?)\[\/PLAN\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: content.slice(last, match.index).trim() });
    parts.push({ type: "plan", value: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push({ type: "text", value: content.slice(last).trim() });
  return parts.filter((p) => p.value);
}

export function ChatInterface() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const { messages, setMessages, loadedForUser, hasMore, setHasMore, name, setName, contextRef } = useChatStore();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [userTimeZone, setUserTimeZone] = useState("America/Santiago");
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(
    () => !!user && loadedForUser.current !== user.id,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<MentionInputHandle>(null);

  const PAGE_SIZE = 10;

  const rowToMsg = (row: any): Msg => {
    const parsed = row.role === "assistant" ? parseAction(row.content) : { clean: row.content, action: null };
    return {
      id: row.id,
      role: row.role,
      content: parsed.clean,
      action: parsed.action,
      actionStatus: row.metadata?.actionStatus ?? (parsed.action ? "pending" : undefined),
      createdAt: new Date(row.created_at).getTime(),
    };
  };

  const loadMore = async () => {
    if (!user || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = new Date(messages[0].createdAt).toISOString();
    const scrollEl = scrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    const prevTop = scrollEl?.scrollTop ?? 0;
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (data) {
      const older = data.map(rowToMsg).reverse();
      skipAutoScrollRef.current = true;
      setMessages((m) => [...older, ...m]);
      setHasMore(data.length === PAGE_SIZE);
      // Preserve scroll position after prepending
      requestAnimationFrame(() => {
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight + prevTop;
        }
      });
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    setUserTimeZone(detectUserTimeZone());
  }, []);

  // Load history + context ONCE per user. Cached in chat store across navigations.
  useEffect(() => {
    if (!user) return;
    if (loadedForUser.current === user.id) {
      setInitialLoading(false);
      return;
    }
    let cancelled = false;
    setInitialLoading(true);
    (async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const [history, profile, t, m, r] = await Promise.all([
        supabase.from("chat_messages")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE),
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase.from("tasks").select("title,due_date,priority,status").in("status", ["borrador", "en_curso"]).limit(20),
        supabase.from("meetings").select("title,datetime").gte("datetime", startOfDay.toISOString()).order("datetime").limit(15),
        supabase.from("reminders").select("title,datetime,done").eq("done", false).gte("datetime", startOfDay.toISOString()).limit(15),
      ]);
      if (cancelled) return;

      if (history?.data) {
        const rows = [...history.data].reverse();
        setMessages(rows.map(rowToMsg));
        setHasMore(history.data.length === PAGE_SIZE);
      }
      setName((profile.data?.name ?? "").split(" ")[0] || "");
      contextRef.current = {
        name: profile.data?.name ?? "",
        now: new Date().toISOString(),
        tasks: t.data ?? [],
        meetings: m.data ?? [],
        reminders: r.data ?? [],
      };
      loadedForUser.current = user.id;
      setInitialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Auto-scroll (skip when prepending older messages)
  const skipAutoScrollRef = useRef(false);
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // (auto-resize handled inside MentionInput)

  // Runs an assistant turn. `visibleUserMsg` is shown + persisted; `hiddenUserSignal` is
  // sent to the model but NOT shown in the UI nor saved. Used to continue a chain of
  // one-action-at-a-time proposals after the user confirms/declines an action card.
  const runAssistantTurn = async (opts: {
    visibleUserMsg?: Msg;
    hiddenUserSignal?: string;
  }) => {
    if (!user || streaming) return;

    let next = messages;
    if (opts.visibleUserMsg) {
      next = [...messages, opts.visibleUserMsg];
      setMessages(next);
      void supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: opts.visibleUserMsg.content,
      }).then(({ error }) => { if (error) console.error("save user msg", error); });
    } else {
      // Read latest messages from state ref via setMessages callback
      next = await new Promise<Msg[]>((resolve) => {
        setMessages((m) => { resolve(m); return m; });
      });
    }

    setStreaming(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payloadMessages = next.slice(-20).map((m) => ({ role: m.role, content: m.content }));
      if (opts.hiddenUserSignal) {
        payloadMessages.push({ role: "user", content: opts.hiddenUserSignal });
      }
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ timezone: userTimeZone, messages: payloadMessages }),
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
        const display = stripPartialJsonForLive(raw);
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

  const sendText = async (text: string) => {
    if (!text.trim() || !user || streaming) return;
    setInput("");
    await runAssistantTurn({
      visibleUserMsg: {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        createdAt: Date.now(),
      },
    });
  };


  const dayKeyInTz = (iso: string | null | undefined, tz: string): string => {
    if (!iso) return "none";
    try {
      const d = new Date(iso);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(d);
      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const day = parts.find(p => p.type === "day")?.value;
      return `${y}-${m}-${day}`;
    } catch { return "none"; }
  };

  const insertOne = async (action: Action): Promise<"created" | "duplicate" | "updated"> => {
    if (!user) return "duplicate";
    const dt = toUTCISOString(action.datetime ?? null, userTimeZone, { treatZuluAsLocal: true });
    if (action.type === "task_update") {
      if (!action.task_id) return "duplicate";
      const patch: Record<string, any> = {};
      if (action.new_title && action.new_title.trim()) patch.title = action.new_title.trim();
      if (dt) patch.due_date = dt;
      if (action.new_start_date !== undefined && action.new_start_date !== null) {
        const sdt = toUTCISOString(action.new_start_date, userTimeZone, { treatZuluAsLocal: true });
        if (sdt) patch.start_date = sdt;
      }
      if (action.priority) patch.priority = action.priority;
      if (action.new_status) patch.status = action.new_status;
      if (action.project_id !== undefined && action.project_id !== null) patch.project_id = action.project_id;
      if (Object.keys(patch).length === 0) return "duplicate";
      const { error } = await (supabase.from("tasks") as any).update(patch).eq("id", action.task_id).eq("user_id", user.id);
      if (error) throw error;
      return "updated";
    }
    if (action.type === "task") {
      // Dedupe: same title (case-insensitive) and same day in user TZ
      const { data: existing } = await supabase
        .from("tasks")
        .select("title, due_date")
        .eq("user_id", user.id)
        .ilike("title", action.title.trim());
      const newKey = dayKeyInTz(dt, userTimeZone);
      const dup = (existing ?? []).some((t: any) =>
        t.title.trim().toLowerCase() === action.title.trim().toLowerCase()
        && dayKeyInTz(t.due_date, userTimeZone) === newKey,
      );
      if (dup) return "duplicate";
      const startDt = action.start_date
        ? toUTCISOString(action.start_date, userTimeZone, { treatZuluAsLocal: true })
        : null;
      await supabase.from("tasks").insert({
        user_id: user.id,
        title: action.title,
        description: action.description ?? null,
        priority: action.priority ?? "medium",
        status: action.status ?? "borrador",
        start_date: startDt,
        due_date: dt,
        project_id: action.project_id ?? null,
      });
    } else if (action.type === "meeting") {
      const mDt = dt ?? new Date().toISOString();
      const { data: existingM } = await supabase
        .from("meetings")
        .select("title,datetime")
        .eq("user_id", user.id)
        .ilike("title", action.title.trim());
      const mKey = dayKeyInTz(mDt, userTimeZone);
      const dupM = (existingM ?? []).some((x: any) =>
        x.title.trim().toLowerCase() === action.title.trim().toLowerCase()
        && dayKeyInTz(x.datetime, userTimeZone) === mKey,
      );
      if (dupM) return "duplicate";
      const mType = action.meeting_type ?? null;
      const { data: insertedMeeting } = await supabase
        .from("meetings")
        .insert({
          user_id: user.id,
          title: action.title,
          datetime: mDt,
          duration_minutes: action.duration_minutes ?? 60,
          notes: action.description ?? null,
          meeting_type: mType,
        } as any)
        .select("id")
        .maybeSingle();
      // If it's a video meeting, request a Google Meet link via the sync server fn.
      if (mType === "video" && insertedMeeting?.id) {
        try {
          const { pushMeetingToGoogle } = await import("@/lib/google-sync.functions");
          pushMeetingToGoogle({ data: { meetingId: insertedMeeting.id } })
            .then((res: any) => {
              if (res?.ok === false && res?.reason === "not_connected") {
                toast.message("Conecta Google Calendar para generar el link de Meet automáticamente.");
              }
            })
            .catch(() => {});
        } catch {}
      }
    } else if (action.type === "reminder") {
      const rDt = dt ?? new Date().toISOString();
      // Dedupe: same title (case-insensitive) and same day/hour in user TZ
      const { data: existingR } = await supabase
        .from("reminders")
        .select("title,datetime")
        .eq("user_id", user.id)
        .ilike("title", action.title.trim());
      const rKey = dayKeyInTz(rDt, userTimeZone);
      const newHour = new Date(rDt).getUTCHours() + ":" + new Date(rDt).getUTCMinutes();
      const dupR = (existingR ?? []).some((x: any) => {
        if (x.title.trim().toLowerCase() !== action.title.trim().toLowerCase()) return false;
        if (dayKeyInTz(x.datetime, userTimeZone) !== rKey) return false;
        const xHour = new Date(x.datetime).getUTCHours() + ":" + new Date(x.datetime).getUTCMinutes();
        return xHour === newHour;
      });
      if (dupR) return "duplicate";
      await supabase.from("reminders").insert({
        user_id: user.id,
        title: action.title,
        datetime: rDt,
      });
    } else if (action.type === "note") {
      const content = action.description || action.title;
      const { data: existingN } = await supabase
        .from("notes")
        .select("content")
        .eq("user_id", user.id)
        .eq("type", "note")
        .ilike("content", content.trim());
      const dupN = (existingN ?? []).some((x: any) =>
        x.content.trim().toLowerCase() === content.trim().toLowerCase(),
      );
      if (dupN) return "duplicate";
      await supabase.from("notes").insert({
        user_id: user.id,
        content,
        type: "note",
      });
    }
    return "created";
  };

  const confirmAction = async (msgId: string, action: Action) => {
    if (!user) return;
    try {
      if (action.type === "bulk" && action.items?.length) {
        // Legacy bulk (mensajes antiguos en historial). El nuevo flujo es una acción a la vez.
        let created = 0;
        let dup = 0;
        for (const item of action.items) {
          const r = await insertOne(item);
          if (r === "created") created++;
          else dup++;
        }
        setMessages((m) => m.map((x) => x.id === msgId ? { ...x, actionStatus: "accepted" } : x));
        if (dup > 0 && created > 0) toast.success(`${created} creadas, ${dup} ya existían.`);
        else if (dup > 0 && created === 0) toast.success(`Ya existían todas (${dup}).`);
        else toast.success(`${created} creadas.`);
      } else {
        const r = await insertOne(action);
        setMessages((m) => m.map((x) => x.id === msgId ? { ...x, actionStatus: "accepted" } : x));
        toast.success(r === "duplicate" ? "Ya existía." : r === "updated" ? "Actualizado." : "Listo.");
      }
      // Continúa la cadena: si quedan más acciones pendientes de la última petición,
      // LIA enviará el siguiente mensaje con la siguiente tarjeta; si no, cierra.
      const justDone = action.type === "task_update"
        ? `tarea actualizada (id ${action.task_id})`
        : `${action.type} "${action.title}"${action.datetime ? ` para ${action.datetime}` : ""}`;
      void runAssistantTurn({
        hiddenUserSignal: `__ACTION_CONFIRMED__ Acabo de confirmar y YA quedó guardado: ${justDone}. NO vuelvas a proponer esta misma acción ni una equivalente (mismo título y misma fecha/hora) — ya existe. Si queda OTRA acción distinta pendiente de mi última petición, propónla ahora (una sola, con tarjeta al final y sin preguntas). Si ya no queda nada distinto, cierra con un mensaje breve sin tarjeta.`,
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const declineAction = (msgId: string) => {
    setMessages((m) => m.map((x) => x.id === msgId ? { ...x, actionStatus: "declined" } : x));
    void runAssistantTurn({
      hiddenUserSignal: "__ACTION_DECLINED__ Si queda otra acción pendiente de mi última petición, propónla ahora (una sola, con tarjeta al final y sin preguntas). Si ya no queda nada, cierra con un mensaje breve sin tarjeta.",
    });
  };


  const isEmpty = messages.length === 0 && !initialLoading;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-x-hidden" style={{ background: "var(--bg-base)", maxWidth: "100%" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ maxWidth: "100%" }}>
        <div className="mx-auto w-full" style={{ maxWidth: 680, padding: "24px 24px 16px", overflowX: "hidden" }}>
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
            {hasMore && messages.length > 0 && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    fontSize: 12,
                    border: "1px solid var(--border)",
                    borderRadius: 100,
                    padding: "6px 14px",
                    color: "var(--text-secondary)",
                    background: "var(--bg-elevated)",
                    cursor: loadingMore ? "default" : "pointer",
                    opacity: loadingMore ? 0.6 : 1,
                  }}
                >
                  {loadingMore ? "Cargando..." : "Cargar mensajes anteriores"}
                </button>
              </div>
            )}
            {messages.map((m, idx) => {
              const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={m.id} className="animate-fade-in">
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
              <div className="animate-fade-in">
                <AlfredBubble text="" streaming action={null} assistantInitial={assistant.name.charAt(0).toUpperCase()} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Suggestions + input */}
      <div style={{
        position: "relative",
        background: "linear-gradient(to bottom, transparent 0%, #080808 28%)",
      }}>
        <div
          className="mx-auto w-full"
          style={{ maxWidth: 680, padding: "8px 16px 20px" }}
        >
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
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          lineHeight: 1.5,
          minWidth: 0,
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
  const parts = text ? parseMessageParts(text) : [];
  const hasOnlyPlan = parts.length > 0 && parts.every((p) => p.type === "plan");
  const bubbleStyle: React.CSSProperties = {
    maxWidth: "85%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: "4px 18px 18px 18px",
    padding: "12px 16px",
    fontSize: 14,
    lineHeight: 1.65,
    color: "var(--text-primary)",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    minWidth: 0,
  };
  return (
    <div className="flex items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Skeleton while waiting */}
        {!text && streaming && (
          <div style={bubbleStyle}>
            <div className="flex flex-col gap-2 py-1" aria-label="Escribiendo…">
              <div className="h-3 rounded" style={{ width: "85%", background: "var(--border)", animation: "alfredSkeleton 1.4s ease-in-out infinite" }} />
              <div className="h-3 rounded" style={{ width: "65%", background: "var(--border)", animation: "alfredSkeleton 1.4s ease-in-out infinite", animationDelay: "0.15s" }} />
              <div className="h-3 rounded" style={{ width: "40%", background: "var(--border)", animation: "alfredSkeleton 1.4s ease-in-out infinite", animationDelay: "0.3s" }} />
            </div>
          </div>
        )}
        {parts.map((part, i) => {
          if (part.type === "plan") {
            return <WeeklyPlanCard key={i} planJson={part.value} />;
          }
          const isLastText = i === parts.length - 1 && !hasOnlyPlan;
          return (
            <div key={i} style={{ maxWidth: "85%" }}>
              <div style={bubbleStyle}>
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-pre:overflow-x-auto prose-pre:max-w-full break-words">
                  <ReactMarkdown>{part.value}</ReactMarkdown>
                  {streaming && isLastText && (
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
                </div>
              </div>
            </div>
          );
        })}
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
        <style>{`@keyframes alfredBlinkChat { 50% { opacity: 0; } } @keyframes alfredSkeleton { 0%,100% { opacity: 0.35; } 50% { opacity: 0.7; } }`}</style>
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
  bulk: { label: "Crear varios", Icon: IconCircleCheck },
  task_update: { label: "Editar tarea", Icon: IconPencil },
};


const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  borrador: { label: "Borrador", color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.3)" },
  en_curso: { label: "En Curso", color: "#a78bfa", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" },
  listo: { label: "Listo", color: "#4ade80", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" },
};

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  urgent: { label: "Urgente", color: "#f87171", bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.3)" },
  high: { label: "Alta", color: "#fb923c", bg: "rgba(234,88,12,0.12)", border: "rgba(234,88,12,0.3)" },
  medium: { label: "Media", color: "#fbbf24", bg: "rgba(217,119,6,0.12)", border: "rgba(217,119,6,0.3)" },
  low: { label: "Baja", color: "#9ca3af", bg: "rgba(156,163,175,0.08)", border: "rgba(156,163,175,0.22)" },
};

function Chip({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 9px",
        borderRadius: 100,
        background: bg,
        color,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function TaskItemCard({ item, tz, isBulk }: { item: Action; tz: string; isBulk: boolean }) {
  const isUpdate = item.type === "task_update";
  const title = isUpdate && item.new_title ? item.new_title : item.title;
  const oldTitle = isUpdate && item.new_title ? item.title : null;
  const status = isUpdate ? item.new_status : item.status;
  const statusMeta = status ? STATUS_LABELS[status] : null;
  const priorityMeta = item.priority ? PRIORITY_LABELS[item.priority] : null;
  const dueIso = item.datetime;
  const startIso = isUpdate ? item.new_start_date : item.start_date;

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--bg-base)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-start gap-2">
        <IconCircleCheck size={15} stroke={1.75} style={{ color: "var(--accent-color)", marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.35, wordBreak: "break-word" }}>
            {oldTitle ? (
              <>
                <span style={{ textDecoration: "line-through", color: "var(--text-tertiary)", fontWeight: 400 }}>{oldTitle}</span>
                {" → "}
                {title}
              </>
            ) : (
              title
            )}
          </div>

          {(statusMeta || priorityMeta || dueIso || startIso || item.project_name) && (
            <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 8 }}>
              {statusMeta && <Chip {...statusMeta} />}
              {priorityMeta && <Chip {...priorityMeta} />}
              {item.project_name && (
                <Chip
                  label={item.project_name}
                  color="var(--accent-color)"
                  bg="color-mix(in srgb, var(--accent-color) 12%, transparent)"
                  border="color-mix(in srgb, var(--accent-color) 30%, transparent)"
                />
              )}
              {(startIso || dueIso) && (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                  {startIso && dueIso
                    ? `${formatDateTimeInTimeZone(startIso, tz)} → ${formatDateTimeInTimeZone(dueIso, tz)}`
                    : dueIso
                      ? formatDateTimeInTimeZone(dueIso, tz)
                      : `desde ${formatDateTimeInTimeZone(startIso!, tz)}`}
                </span>
              )}
            </div>
          )}

          {item.description && !isBulk && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
              {item.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const isBulk = action.type === "bulk" && Array.isArray(action.items);
  const items = isBulk ? action.items! : [action];
  const headerMeta = isBulk
    ? { label: `Crear ${items.length} ítems`, Icon: IconCircleCheck }
    : TYPE_META[action.type];
  const HeaderIcon = headerMeta.Icon;
  const tz = detectUserTimeZone();
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
        <HeaderIcon size={14} stroke={1.75} style={{ color: "var(--accent-color)" }} />
        <span style={{ fontSize: 11, color: "var(--accent-color)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
          {headerMeta.label}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it, idx) => {
          const ItemIcon = (TYPE_META[it.type] ?? TYPE_META.task).Icon;
          const isTaskLike = it.type === "task" || it.type === "task_update";
          if (isTaskLike) {
            return <TaskItemCard key={idx} item={it} tz={tz} isBulk={!!isBulk} />;
          }
          return (
            <div
              key={idx}
              style={{
                padding: isBulk ? "8px 10px" : 0,
                background: isBulk ? "var(--bg-base)" : "transparent",
                borderRadius: isBulk ? "var(--radius-sm)" : 0,
                border: isBulk ? "1px solid var(--border)" : "none",
              }}
            >
              {isBulk && (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <ItemIcon size={12} stroke={1.75} style={{ color: "var(--text-tertiary)" }} />
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {TYPE_META[it.type]?.label ?? it.type}
                  </span>
                </div>
              )}
              <p style={{ fontSize: 14, color: "var(--text-primary)" }}>{it.title}</p>
              {it.datetime && (
                <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  {formatDateTimeInTimeZone(it.datetime, tz)}
                </p>
              )}
              {it.description && !isBulk && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
                  {it.description}
                </p>
              )}
            </div>
          );
        })}
      </div>


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
            {isBulk ? `Sí, crear ${items.length}` : action.type === "task_update" ? "Sí, actualizar" : "Sí, crear"}
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
          {status === "accepted" ? (action.type === "task_update" ? "✓ Actualizado." : "✓ Creado.") : "Descartado."}
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
      className="flex items-center gap-2"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: `1.5px solid ${focused ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: 22,
        padding: "8px 8px 8px 16px",
        transition: "border-color 0.2s",
        boxShadow: focused ? "0 0 0 3px rgba(99,102,241,0.08)" : "none",
      }}
    >
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
            fontSize: 15,
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
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: hasText ? "#6366f1" : "transparent",
          border: hasText ? "none" : "1.5px solid rgba(255,255,255,0.08)",
          color: hasText ? "white" : "#444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <IconArrowUp size={17} stroke={2.25} />
      </button>
    </div>
  );
}

