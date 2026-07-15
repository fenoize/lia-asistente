import { useEffect, useMemo, useRef, useState } from "react";
import { stripMentionSyntaxLoose } from "@/lib/mentions";
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
  // Cut at first opening fence or first standalone JSON start,
  // BUT never cut inside a [PLAN]…[/PLAN] block (even if still streaming).
  let cut = raw.length;
  const fence = raw.search(/```/);
  if (fence !== -1) cut = Math.min(cut, fence);

  // Compute plan ranges (closed or open-until-end).
  const planRanges: Array<[number, number]> = [];
  const planOpenRe = /\[PLAN\]/g;
  let pm: RegExpExecArray | null;
  while ((pm = planOpenRe.exec(raw)) !== null) {
    const start = pm.index;
    const closeIdx = raw.indexOf("[/PLAN]", start);
    const end = closeIdx === -1 ? raw.length : closeIdx + "[/PLAN]".length;
    planRanges.push([start, end]);
  }
  const insidePlan = (idx: number) => planRanges.some(([s, e]) => idx >= s && idx < e);

  const jsonRe = /(?:^|\n)\s*([{\[])/g;
  let m: RegExpExecArray | null;
  while ((m = jsonRe.exec(raw)) !== null) {
    const idx = m.index + m[0].length - 1;
    if (m[1] === "[") {
      const rest = raw.slice(idx);
      if (/^\[\/?PLAN\]/.test(rest)) continue;
    }
    if (insidePlan(idx)) continue;
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
  const openRe = /\[PLAN\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: "text", value: content.slice(last, match.index).trim() });
    const after = match.index + match[0].length;
    const closeIdx = content.indexOf("[/PLAN]", after);
    if (closeIdx === -1) {
      // Plan abierto sin cierre (stream truncado) — toma el resto.
      parts.push({ type: "plan", value: content.slice(after).trim() });
      last = content.length;
      break;
    }
    parts.push({ type: "plan", value: content.slice(after, closeIdx).trim() });
    last = closeIdx + "[/PLAN]".length;
    openRe.lastIndex = last;
  }
  if (last < content.length) parts.push({ type: "text", value: content.slice(last).trim() });
  return parts.filter((p) => p.value);
}

function compactAssistantContentForAi(content: string): string {
  if (!content.includes("[PLAN]")) return content;
  const intro = content.split("[PLAN]")[0]?.trim();
  return `${intro ? `${intro}\n` : ""}[Plan semanal mostrado como tarjeta visual; no es un modo activo y no debe retomarse salvo que el usuario pida explícitamente modificar o armar otro plan.]`;
}

// Repara un JSON de plan truncado: descarta la última tarea/objeto incompleto
// y cierra los corchetes/llaves abiertos.
export function tryRepairPlanJson(raw: string): string {
  const s = raw.trim();
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      if (stack.length <= 2) lastSafe = i;
    }
  }
  let trimmed = lastSafe >= 0 ? s.slice(0, lastSafe + 1) : s;
  // Re-evalúa stack del fragmento recortado.
  const stack2: string[] = [];
  inStr = false; esc = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack2.push(c);
    else if (c === "}" || c === "]") stack2.pop();
  }
  trimmed = trimmed.replace(/,\s*$/, "");
  while (stack2.length) {
    const open = stack2.pop();
    trimmed += open === "{" ? "}" : "]";
  }
  return trimmed;
}

export function ChatInterface() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const { messages, setMessages, loadedForUser, hasMore, setHasMore, name, setName, contextRef } = useChatStore();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [userTimeZone, setUserTimeZone] = useState("America/Santiago");
  const [loadingMore, setLoadingMore] = useState(false);
  const [quotaError, setQuotaError] = useState<{ plan: string; limit: number; used: number } | null>(null);
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
      const older = data
        .filter((row: any) => row.role !== "assistant" || row.content.trim().length > 0)
        .map(rowToMsg)
        .reverse();
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
        const rows = [...history.data]
          .reverse()
          .filter((row: any) => row.role !== "assistant" || row.content.trim().length > 0);
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
      const payloadMessages = next.slice(-20).map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? compactAssistantContentForAi(m.content) : m.content,
      }));
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
        if (res.status === 402) {
          try {
            const parsed = JSON.parse(errText);
            if (parsed?.code === "QUOTA_EXCEEDED") {
              setQuotaError({
                plan: parsed.plan ?? "free",
                limit: parsed.limit ?? 0,
                used: parsed.used ?? 0,
              });
              setMessages((m) => m.filter((msg) => msg.id !== assistantId));
              setStreaming(false);
              return;
            }
          } catch {}
        }
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
      if (!raw.trim()) throw new Error("empty_ai_response");
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
            {quotaError && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  padding: 16,
                  borderRadius: 14,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.28)",
                  color: "#fecaca",
                }}
              >
                <IconAlertCircle size={20} stroke={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "#fca5a5" }}>
                    Llegaste al límite de tokens de este mes
                  </div>
                  <div>
                    Tu plan <b>{quotaError.plan}</b> incluye {quotaError.limit.toLocaleString("es-CL")} tokens por ciclo y ya los utilizaste todos. Puedes continuar usando el resto de LIA con normalidad. Para seguir usando el chat con IA, contacta al administrador para agregar tokens o espera el inicio de tu próximo ciclo.
                  </div>
                </div>
              </div>
            )}
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


// ─── Weekly Plan Card ────────────────────────────────────────────────────────
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

const PRIORITY_UI_TO_DB: Record<PlanTask["priority"], string> = {
  urgente: "urgent", alta: "high", media: "medium", baja: "low",
};

function WeeklyPlanCard({ planJson }: { planJson: string }) {
  const parsed = useMemo<WeeklyPlan | null>(() => {
    try { return JSON.parse(planJson) as WeeklyPlan; } catch {}
    try { return JSON.parse(tryRepairPlanJson(planJson)) as WeeklyPlan; } catch {}
    return null;
  }, [planJson]);
  const { user } = useAuth();
  const { setMessages } = useChatStore();

  const planStart = parsed?.days[0]?.date ?? "";
  const planEnd = parsed?.days[parsed.days.length - 1]?.date ?? "";

  const [planDays, setPlanDays] = useState<PlanDay[]>(
    () => parsed ? JSON.parse(JSON.stringify(parsed.days)) : []
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState<{ dayIdx: number; taskIdx: number } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<PlanTask["priority"]>("media");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editDate, setEditDate] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [calView, setCalView] = useState(new Date());
  const [editProject, setEditProject] = useState<{ id: string; name: string } | null>(null);
  const [projOpen, setProjOpen] = useState(false);
  const [projQuery, setProjQuery] = useState("");
  const [projResults, setProjResults] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState<"idle" | "approving" | "done">("idle");
  const [approveStep, setApproveStep] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<(HTMLDivElement | null)[]>([]);

  const totalTasks = planDays.reduce((s, d) => s + d.tasks.length, 0);

  function inPlan(ds: string) { return !!ds && ds >= planStart && ds <= planEnd; }
  function fmtDate(ds: string) {
    if (!ds) return "—";
    const [y, m, d] = ds.split("-").map(Number);
    return `${DAYS_ES[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS_ES[m - 1]}`;
  }
  function dStr(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function handlePointerDown(e: React.PointerEvent, dayIdx: number, taskIdx: number) {
    if (status !== "idle") return;
    e.preventDefault();
    const task = planDays[dayIdx].tasks[taskIdx];
    setDrag({
      taskId: `${dayIdx}-${taskIdx}`,
      fromDayIdx: dayIdx, fromTaskIdx: taskIdx,
      title: task.title, active: false, targetDayIdx: null,
      startX: e.clientX, startY: e.clientY,
    });
  }

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.active && Math.sqrt(dx * dx + dy * dy) > 8) {
        setDrag((d) => d ? { ...d, active: true } : null);
      }
      if (drag.active) {
        e.preventDefault();
        setGhostPos({ x: e.clientX + 10, y: e.clientY - 14 });
        let found: number | null = null;
        dayRefs.current.forEach((ref, i) => {
          if (!ref) return;
          const r = ref.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right &&
              e.clientY >= r.top && e.clientY <= r.bottom) found = i;
        });
        setDrag((d) => d ? { ...d, targetDayIdx: found } : null);
      }
    }
    function onUp() {
      if (!drag) return;
      if (drag.active) {
        if (drag.targetDayIdx !== null && drag.targetDayIdx !== drag.fromDayIdx) {
          setPlanDays((prev) => {
            const next = prev.map((d) => ({ ...d, tasks: [...d.tasks] }));
            const [task] = next[drag.fromDayIdx].tasks.splice(drag.fromTaskIdx, 1);
            next[drag.targetDayIdx!].tasks.push(task);
            return next;
          });
        }
        setDrag(null);
      } else {
        const { fromDayIdx: di, fromTaskIdx: ti } = drag;
        setDrag(null);
        openEdit(di, ti);
      }
    }
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  function openEdit(dayIdx: number, taskIdx: number) {
    const task = planDays[dayIdx].tasks[taskIdx];
    setEditing({ dayIdx, taskIdx });
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditTime(task.start_time);
    setEditDuration(String(task.duration_minutes));
    setEditDate(planDays[dayIdx].date);
    setEditProject(task.project_name ? { id: "", name: task.project_name } : null);
    setCalOpen(false);
    setProjOpen(false);
    setProjQuery("");
    setCalView(new Date(planDays[dayIdx].date));
  }

  function saveEdit() {
    if (!editing) return;
    setPlanDays((prev) => {
      const next = prev.map((d) => ({ ...d, tasks: [...d.tasks] }));
      const task = { ...next[editing.dayIdx].tasks[editing.taskIdx] };
      task.title = editTitle || task.title;
      task.priority = editPriority;
      task.start_time = editTime || task.start_time;
      task.duration_minutes = parseInt(editDuration) || task.duration_minutes;
      task.project_name = editProject?.name ?? null;
      if (editDate && editDate !== next[editing.dayIdx].date) {
        next[editing.dayIdx].tasks.splice(editing.taskIdx, 1);
        const targetIdx = next.findIndex((d) => d.date === editDate);
        if (targetIdx >= 0) next[targetIdx].tasks.push(task);
      } else {
        next[editing.dayIdx].tasks[editing.taskIdx] = task;
      }
      return next;
    });
    setEditing(null);
  }

  async function handleProjSearch(q: string) {
    setProjQuery(q);
    if (q.length < 3 || !user) { setProjResults([]); return; }
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .ilike("name", `%${q}%`)
      .limit(8);
    setProjResults(data ?? []);
  }

  async function approvePlan() {
    if (!user) return;
    setStatus("approving");
    const STEPS = 4;
    const tick = (async () => {
      for (let i = 1; i <= STEPS; i++) {
        setApproveStep(i);
        await new Promise((r) => setTimeout(r, 600));
      }
    })();

    const allTasks = planDays.flatMap((day) => day.tasks.map((task) => ({ task, day })));

    // Resolve project names → project_ids in one query per unique name
    const uniqueNames = Array.from(new Set(allTasks.map((t) => t.task.project_name).filter(Boolean) as string[]));
    const nameToId: Record<string, string | null> = {};
    if (uniqueNames.length > 0) {
      const { data: projs } = await supabase
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id)
        .in("name", uniqueNames);
      for (const n of uniqueNames) {
        nameToId[n] = projs?.find((p) => p.name === n)?.id ?? null;
      }
    }

    const ops = allTasks.map(async ({ task, day }) => {
      const priorityDb = PRIORITY_UI_TO_DB[task.priority] ?? "medium";
      const projectId = task.project_name ? (nameToId[task.project_name] ?? null) : null;
      // Build a timestamp for start_date combining day.date + start_time in local TZ.
      let startDateIso: string | null = null;
      if (day.date) {
        const hhmm = task.start_time && /^\d{1,2}:\d{2}/.test(task.start_time) ? task.start_time : "09:00";
        const local = new Date(`${day.date}T${hhmm}:00`);
        startDateIso = isNaN(local.getTime()) ? null : local.toISOString();
      }
      const payload: Record<string, unknown> = {
        title: task.title,
        priority: priorityDb,
        start_date: startDateIso,
        start_time: task.start_time || null,
        duration_minutes: task.duration_minutes || null,
        project_id: projectId,
        project: !projectId && task.project_name ? task.project_name : null,
      };
      if (task.action === "update" && task.task_id) {
        return supabase.from("tasks").update(payload as never).eq("id", task.task_id).eq("user_id", user.id);
      }
      return supabase.from("tasks").insert({
        ...payload,
        status: "borrador",
        user_id: user.id,
      } as never);
    });

    const results = await Promise.all(ops);
    await tick;
    const failed = results.filter((r: any) => r?.error).length;
    if (failed > 0) {
      toast.error(`${failed} tareas no se pudieron guardar.`);
    }
    setStatus("done");

    const confirmText = `Listo. Plan aplicado y cerrado: las ${allTasks.length} tareas ya están en ejecución. ¿Qué necesitas ahora?`;
    const newMsg: Msg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: confirmText,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, newMsg]);
    void supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: confirmText,
    }).then(({ error }) => { if (error) console.error("save plan confirm", error); });
  }

  const PCOLORS: Record<string, { bg: string; color: string; border: string }> = {
    urgente: { bg: "rgba(239,68,68,0.12)",  color: "#f87171", border: "rgba(239,68,68,0.35)" },
    alta:    { bg: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "rgba(245,158,11,0.35)" },
    media:   { bg: "rgba(99,102,241,0.1)",  color: "#a78bfa", border: "rgba(99,102,241,0.35)" },
    baja:    { bg: "rgba(100,100,100,0.1)", color: "#6b7280", border: "rgba(100,100,100,0.35)" },
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e",
    borderRadius: 9, padding: "0 12px", fontSize: 13, color: "#d0d0d0",
    fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8,
    height: 40, cursor: "pointer", textAlign: "left", marginBottom: 12,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: "#444", textTransform: "uppercase",
    letterSpacing: "0.04em", marginBottom: 5,
  };
  const navBtnStyle: React.CSSProperties = {
    background: "transparent", border: "none", color: "#444", cursor: "pointer",
    width: 26, height: 26, borderRadius: 6, fontSize: 16, display: "flex",
    alignItems: "center", justifyContent: "center",
  };

  function CalendarDropdown() {
    const y = calView.getFullYear(), m = calView.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const totalDays = new Date(y, m + 1, 0).getDate();
    const prevTotal = new Date(y, m, 0).getDate();
    const cells: { d: number; ds: string; other: boolean }[] = [];
    for (let i = firstDow - 1; i >= 0; i--)
      cells.push({ d: prevTotal - i, ds: dStr(y, m - 1, prevTotal - i), other: true });
    for (let d = 1; d <= totalDays; d++)
      cells.push({ d, ds: dStr(y, m, d), other: false });
    const rem = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= rem; d++)
      cells.push({ d, ds: dStr(y, m + 1, d), other: true });

    return (
      <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 10, padding: 10, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={() => setCalView(new Date(y, m - 1, 1))} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#888" }}>{MONTHS_ES[m]} {y}</span>
          <button onClick={() => setCalView(new Date(y, m + 1, 1))} style={navBtnStyle}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 3 }}>
          {["L","M","M","J","V","S","D"].map((d, i) => (
            <span key={i} style={{ textAlign: "center", fontSize: 9, color: "#2a2a3a", fontWeight: 600 }}>{d}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
          {cells.map((cell, i) => {
            const isSelected = cell.ds === editDate;
            const isInPlan = inPlan(cell.ds) && !cell.other;
            const isStart = cell.ds === planStart;
            const isEnd = cell.ds === planEnd;
            return (
              <button
                key={i}
                onClick={() => { setEditDate(cell.ds); setTimeout(() => setCalOpen(false), 180); }}
                style={{
                  width: "100%", aspectRatio: "1", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, border: "none", cursor: "pointer",
                  fontFamily: "inherit",
                  borderRadius: isSelected ? "50%" : isStart ? "50% 0 0 50%" : isEnd ? "0 50% 50% 0" : isInPlan ? 0 : "50%",
                  background: isSelected ? "#6366f1" : isInPlan ? "rgba(99,102,241,0.09)" : "transparent",
                  color: isSelected ? "white" : cell.other ? "#1e1e2e" : isInPlan ? "#888" : "#555",
                  fontWeight: isSelected ? 600 : 400,
                }}
              >{cell.d}</button>
            );
          })}
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div style={{ padding: 10, fontSize: 12, color: "#888", background: "#0d0d1e", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 10 }}>
        No se pudo leer el plan semanal.
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", background: "#0d0d1e", border: "1px solid rgba(99,102,241,0.28)", borderRadius: 14, overflow: "hidden", touchAction: "none", maxWidth: "85%" }}>
      <div style={{ padding: "10px 13px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Plan semanal</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#444" }}>{totalTasks} tareas</span>
      </div>
      {parsed.summary && (
        <div style={{ padding: "6px 13px", fontSize: 12, color: "#888", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>{parsed.summary}</div>
      )}
      <div style={{ padding: "5px 13px 6px", fontSize: 10, color: "#3a3a5a", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
        ⠿ Mantén presionado para mover · Toca para editar
      </div>

      <div style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
        {planDays.map((day, dayIdx) => (
          <div
            key={day.date}
            ref={(el) => { dayRefs.current[dayIdx] = el; }}
            style={{
              borderRadius: 10, padding: 3,
              border: `1.5px solid ${drag?.active && drag.targetDayIdx === dayIdx ? "rgba(99,102,241,0.45)" : "transparent"}`,
              background: drag?.active && drag.targetDayIdx === dayIdx ? "rgba(99,102,241,0.07)" : "transparent",
              transition: "border-color 0.12s, background 0.12s",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, color: "#5a5a7a", textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 4px 4px" }}>{day.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minHeight: 22, padding: "0 2px 2px" }}>
              {day.tasks.map((task, taskIdx) => {
                const isDragging = drag?.active && drag.fromDayIdx === dayIdx && drag.fromTaskIdx === taskIdx;
                const pill = PCOLORS[task.priority] ?? PCOLORS.media;
                return (
                  <div
                    key={`${dayIdx}-${taskIdx}`}
                    onPointerDown={(e) => handlePointerDown(e, dayIdx, taskIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8, padding: "6px 8px", cursor: "grab",
                      userSelect: "none", touchAction: "none",
                      opacity: isDragging ? 0.12 : 1, transition: "opacity 0.2s",
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#252535", flexShrink: 0 }}>⠿</span>
                    {task.project_name && (
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#818cf8", flexShrink: 0, display: "inline-block" }} />
                    )}
                    <span style={{ fontSize: 11, color: "#b0b0c0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripMentionSyntaxLoose(task.title)}</span>
                    {task.start_time && <span style={{ fontSize: 10, color: "#666", flexShrink: 0 }}>{task.start_time}</span>}
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 100, background: pill.bg, color: pill.color, flexShrink: 0 }}>{task.priority}</span>
                    {task.action === "create" && (
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 100, background: "rgba(16,185,129,0.1)", color: "#34d399", flexShrink: 0 }}>nueva</span>
                    )}
                  </div>
                );
              })}
              {day.tasks.length === 0 && (
                <div style={{ height: 20, borderRadius: 6, border: "1px dashed rgba(99,102,241,0.15)" }} />
              )}
            </div>
          </div>
        ))}
      </div>

      {status === "idle" && (
        <div style={{ padding: "0 13px 13px", display: "flex", gap: 7 }}>
          <button
            onClick={approvePlan}
            disabled={totalTasks === 0}
            style={{ flex: 1, padding: 11, borderRadius: 10, background: "#6366f1", color: "white", border: "none", fontSize: 13, fontWeight: 500, cursor: totalTasks === 0 ? "not-allowed" : "pointer", opacity: totalTasks === 0 ? 0.5 : 1 }}
          >Aprobar plan · {totalTasks} tareas</button>
        </div>
      )}
      {status === "approving" && (
        <div style={{ padding: "12px 13px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {["Analizando el plan...","Actualizando tareas...","Sincronizando con el calendario...","Confirmando cambios..."].map((label, i) => {
            const done = approveStep > i + 1, active = approveStep === i + 1;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: done ? "#4ade80" : active ? "#818cf8" : "#333", transition: "color 0.3s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: done ? "#4ade80" : active ? "#818cf8" : "#1e1e2e", transition: "background 0.3s" }} />
                {label}
              </div>
            );
          })}
        </div>
      )}
      {status === "done" && (
        <div style={{ padding: "6px 13px 13px", display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 13, color: "#4ade80" }}>Plan aplicado · {totalTasks} tareas</span>
        </div>
      )}

      {drag?.active && (
        <div style={{
          position: "fixed", pointerEvents: "none", zIndex: 9999,
          left: ghostPos.x, top: ghostPos.y,
          background: "#1c1c2e", border: "1.5px solid rgba(99,102,241,0.75)",
          borderRadius: 8, padding: "7px 10px", fontSize: 11, color: "#c0c0c0",
          whiteSpace: "nowrap", maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis",
          boxShadow: "0 8px 28px rgba(0,0,0,0.7)", transform: "rotate(-1.5deg) scale(1.04)",
        }}>⠿ {stripMentionSyntaxLoose(drag.title)}</div>
      )}

      {editing !== null && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 100, display: "flex", alignItems: "flex-end" }}
        >
          <div style={{ background: "#0e0e1a", borderRadius: "20px 20px 0 0", borderTop: "1px solid #1e1e2e", padding: "0 16px 24px", width: "100%", maxHeight: "calc(100% - 32px)", overflowY: "auto" }}>
            <div style={{ width: 36, height: 4, background: "#2a2a3a", borderRadius: 2, margin: "12px auto 14px" }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: "#f0f0f0", marginBottom: 14 }}>Editar tarea</div>

            <div style={labelStyle}>Título</div>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: 9, padding: "9px 12px", fontSize: 14, color: "#d0d0d0", outline: "none", marginBottom: 12, fontFamily: "inherit", height: 40 }}
            />

            <div style={labelStyle}>
              Fecha
              {editDate && !inPlan(editDate) && (
                <span style={{ fontSize: 10, color: "#f87171", marginLeft: 6 }}>· Quedará fuera del plan</span>
              )}
            </div>
            <button
              onClick={() => setCalOpen((o) => !o)}
              style={{ ...fieldStyle, borderColor: calOpen ? "rgba(99,102,241,0.5)" : "#1e1e2e" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{ flex: 1, color: editDate ? "#d0d0d0" : "#555" }}>{fmtDate(editDate)}</span>
              <svg style={{ color: "#2a2a3a", transform: calOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {calOpen && <CalendarDropdown />}

            <div style={{ ...labelStyle, marginTop: calOpen ? 8 : 0 }}>Proyecto</div>
            <button
              onClick={() => setProjOpen((o) => !o)}
              style={{ ...fieldStyle, borderColor: projOpen ? "rgba(99,102,241,0.4)" : "#1e1e2e" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={editProject ? "#818cf8" : "none"} stroke={editProject ? "#818cf8" : "#3a3a5a"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: editProject ? 0.9 : 1, flexShrink: 0 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={{ flex: 1, color: editProject ? "#c0c0c0" : "#555" }}>{editProject?.name ?? "Sin proyecto"}</span>
              {editProject && (
                <span onClick={(e) => { e.stopPropagation(); setEditProject(null); }} style={{ fontSize: 11, color: "#444", cursor: "pointer", padding: "2px 4px" }}>✕</span>
              )}
              <svg style={{ color: "#2a2a3a", transform: projOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {projOpen && (
              <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 10, padding: 8, marginBottom: 12 }}>
                <input
                  autoFocus
                  value={projQuery}
                  onChange={(e) => handleProjSearch(e.target.value)}
                  placeholder="Buscar proyecto (mín. 3 letras)..."
                  style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#d0d0d0", outline: "none", marginBottom: 6, fontFamily: "inherit" }}
                />
                {projQuery.length < 3 ? (
                  <div style={{ fontSize: 11, color: "#2a2a3a", padding: "3px 2px" }}>Escribe al menos 3 caracteres...</div>
                ) : projResults.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#2a2a3a", padding: "3px 2px" }}>Sin resultados</div>
                ) : (
                  projResults.map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => { setEditProject(proj); setProjOpen(false); setProjQuery(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 7, cursor: "pointer", fontSize: 12, color: "#b0b0c0" }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
                      {proj.name}
                    </div>
                  ))
                )}
              </div>
            )}

            <div style={labelStyle}>Prioridad</div>
            <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
              {(["urgente","alta","media","baja"] as const).map((p) => {
                const c = PCOLORS[p], active = editPriority === p;
                return (
                  <button key={p} onClick={() => setEditPriority(p)}
                    style={{ flex: 1, padding: "7px 2px", borderRadius: 8, border: `1px solid ${active ? c.border : "#1e1e2e"}`, background: active ? c.bg : "transparent", color: active ? c.color : "#444", fontSize: 10, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                  >{p}</button>
                );
              })}
            </div>

            <div style={labelStyle}>Hora · Duración (min)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)}
                style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: 9, padding: "9px 10px", fontSize: 13, color: "#d0d0d0", outline: "none", fontFamily: "inherit" }} />
              <input type="number" min={15} step={15} value={editDuration} onChange={(e) => setEditDuration(e.target.value)} placeholder="min"
                style={{ width: 80, background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: 9, padding: "9px 10px", fontSize: 13, color: "#d0d0d0", outline: "none", fontFamily: "inherit" }} />
            </div>

            <button onClick={saveEdit}
              style={{ width: "100%", padding: 12, borderRadius: 10, background: "#6366f1", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
            >Guardar cambios</button>
          </div>
        </div>
      )}
    </div>
  );
}
