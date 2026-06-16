import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { buildContext } from "@/lib/ai/context-builder";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { extractMentions } from "@/lib/mentions";
import { USER_TZ } from "@/lib/timezone";

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const PRIORITY_TO_PLAN: Record<string, "urgente" | "alta" | "media" | "baja"> = {
  urgent: "urgente",
  high: "alta",
  medium: "media",
  low: "baja",
};
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

type ChatBodyMessage = { role: "user" | "assistant"; content: string };
type TaskPlanRow = {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  project_id: string | null;
  project: string | null;
};
type ProjectPlanRow = { id: string; name: string };
type PlanResponseTask = {
  task_id: string;
  action: "update";
  title: string;
  priority: "urgente" | "alta" | "media" | "baja";
  start_time: string;
  duration_minutes: number;
  project_name: string | null;
};

function norm(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function localDateString(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseStartTime(text: string) {
  const matches = [
    ...text.matchAll(/(?:desde\s+(?:las?\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/gi),
  ];
  const useful = matches.filter((m) => /desde|\d{1,2}:\d{2}|am|pm|a\.m\.|p\.m\./i.test(m[0]));
  const m = useful.at(-1);
  if (!m) return "09:00";
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  const suffix = norm(m[3] ?? "");
  if (suffix.includes("pm") || suffix.includes("p.m")) hour = hour === 12 ? 12 : hour + 12;
  if ((suffix.includes("am") || suffix.includes("a.m")) && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "09:00";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parsePlanIntent(messages: ChatBodyMessage[], timezone: string) {
  const userText = norm(
    messages
      .filter((m) => m.role === "user")
      .slice(-4)
      .map((m) => m.content)
      .join("\n"),
  );
  const today = localDateString(timezone);
  const isWeekly = /semana|semanal|lunes\s+a\s+domingo/.test(userText);
  let startDate = today;
  if (/manana/.test(userText)) {
    startDate = addDays(today, 1);
  } else if (/hoy/.test(userText)) {
    startDate = today;
  } else {
    const weekdayMap: Record<string, number> = {
      domingo: 0,
      lunes: 1,
      martes: 2,
      miercoles: 3,
      jueves: 4,
      viernes: 5,
      sabado: 6,
    };
    const hit = Object.entries(weekdayMap).find(([name]) => userText.includes(name));
    if (hit) {
      const current = new Date(`${today}T12:00:00`).getDay();
      const target = hit[1];
      const diff = (target - current + 7) % 7;
      startDate = addDays(today, diff);
    }
  }
  return { isWeekly, startDate, startTime: parseStartTime(userText) };
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesToTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function planLabel(dateString: string) {
  const d = new Date(`${dateString}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function isPlanRequest(messages: { role: "user" | "assistant"; content: string }[]) {
  const text = norm(messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n"));
  return /\bplan\b/.test(text) && /\b(planifica|organiza|ordenar|ordename|armame|arma|hazme|semana|tarea|pendiente|dia|hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.test(text);
}

async function buildTaskPlanResponse(sb: any, messages: { role: "user" | "assistant"; content: string }[], timezone: string, userName: string) {
  const intent = parsePlanIntent(messages, timezone);
  const dayCount = 7;
  const { data: tasks, error } = await sb
    .from("tasks")
    .select("id, title, priority, status, due_date, start_date, project_id, project")
    .in("status", ["borrador", "en_curso"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(intent.isWeekly ? 35 : 12);
  if (error) throw error;

  const projectIds = Array.from(new Set((tasks ?? []).map((t: any) => t.project_id).filter(Boolean)));
  const { data: projects } = projectIds.length
    ? await sb.from("projects").select("id, name").in("id", projectIds)
    : { data: [] };
  const projectNames = new Map<string, string>((projects ?? []).map((p: any) => [p.id, p.name]));

  const sorted = [...(tasks ?? [])].sort((a: any, b: any) => {
    const statusA = a.status === "en_curso" ? -1 : 0;
    const statusB = b.status === "en_curso" ? -1 : 0;
    if (statusA !== statusB) return statusA - statusB;
    const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (pr !== 0) return pr;
    return new Date(a.due_date ?? "2999-12-31").getTime() - new Date(b.due_date ?? "2999-12-31").getTime();
  });

  const days = Array.from({ length: dayCount }, (_, i) => ({
    date: addDays(intent.startDate, i),
    label: planLabel(addDays(intent.startDate, i)),
    tasks: [] as any[],
  }));
  const cursors = days.map((_, i) => timeToMinutes(i === 0 ? intent.startTime : "09:00"));
  const maxPerDay = 5;

  sorted.slice(0, intent.isWeekly ? dayCount * maxPerDay : maxPerDay).forEach((task: any, index: number) => {
    const dayIdx = intent.isWeekly ? Math.min(days.length - 1, Math.floor(index / maxPerDay)) : 0;
    const priority = PRIORITY_TO_PLAN[task.priority] ?? "media";
    const duration = priority === "urgente" ? 90 : priority === "alta" ? 75 : priority === "media" ? 60 : 45;
    days[dayIdx].tasks.push({
      task_id: task.id,
      action: "update",
      title: task.title,
      priority,
      start_time: minutesToTime(cursors[dayIdx]),
      duration_minutes: duration,
      project_name: task.project_id ? (projectNames.get(task.project_id) ?? null) : (task.project ?? null),
    });
    cursors[dayIdx] += duration + 15;
  });

  const firstName = (userName || "Diego").split(" ")[0];
  const summary = intent.isWeekly
    ? "Prioricé tus tareas abiertas en bloques manejables para la semana."
    : `Prioricé tus tareas abiertas desde las ${intent.startTime}.`;
  const plan = { type: "weekly_plan", summary, days };
  const intro = days.reduce((sum, day) => sum + day.tasks.length, 0) > 0
    ? `Perfecto, ${firstName} — armé el plan con tus tareas pendientes. Revísalo y apruébalo si te calza.`
    : `${firstName}, no encontré tareas pendientes abiertas para planificar. Te dejo el plan vacío para que lo usemos como base.`;
  return `${intro}\n\n[PLAN]\n${JSON.stringify(plan)}\n[/PLAN]`;
}

async function buildMentionsBlock(sb: any, lastUserText: string): Promise<string> {
  const mentions = extractMentions(lastUserText);
  if (mentions.length === 0) return "";
  const contactIds = mentions.filter((m) => m.type === "contact").map((m) => m.id);
  const projectIds = mentions.filter((m) => m.type === "project").map((m) => m.id);
  const [cRes, pRes, tRes] = await Promise.all([
    contactIds.length
      ? sb.from("contacts").select("id, name, company, relationship_type, type, status, context").in("id", contactIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? sb.from("projects").select("id, name, status, due_date, client_id").in("id", projectIds)
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? sb.from("tasks").select("project_id, status").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);
  const contactsById = new Map<string, any>((cRes.data ?? []).map((c: any) => [c.id, c]));
  const tasksByProject = new Map<string, number>();
  (tRes.data ?? []).forEach((t: any) => {
    if (t.status !== "listo") tasksByProject.set(t.project_id, (tasksByProject.get(t.project_id) ?? 0) + 1);
  });
  // Resolve client names for projects
  const clientIds = (pRes.data ?? []).map((p: any) => p.client_id).filter(Boolean);
  let clientMap = new Map<string, string>();
  if (clientIds.length) {
    const { data: cs } = await sb.from("contacts").select("id, name").in("id", clientIds);
    clientMap = new Map((cs ?? []).map((c: any) => [c.id, c.name]));
  }
  const lines: string[] = [];
  for (const m of mentions) {
    if (m.type === "contact") {
      const c = contactsById.get(m.id);
      if (!c) { lines.push(`- Contacto: ${m.name} (id: ${m.id})`); continue; }
      const rt = c.relationship_type ?? c.type ?? "contacto";
      const extras = [c.company, c.status ? `estado ${c.status}` : null, c.context].filter(Boolean).join(" — ");
      lines.push(`- Contacto: ${c.name} (${rt}${extras ? `; ${extras}` : ""}) [id: ${m.id}]`);
    } else {
      const p = (pRes.data ?? []).find((x: any) => x.id === m.id);
      if (!p) { lines.push(`- Proyecto: ${m.name} (id: ${m.id})`); continue; }
      const pending = tasksByProject.get(p.id) ?? 0;
      const client = p.client_id ? clientMap.get(p.client_id) : null;
      const due = p.due_date ? `vence ${new Date(p.due_date).toLocaleDateString("es-CL")}` : null;
      const extras = [p.status ? `estado ${p.status}` : null, `${pending} tareas pendientes`, client ? `cliente ${client}` : null, due]
        .filter(Boolean).join(", ");
      lines.push(`- Proyecto: ${p.name} (${extras}) [id: ${m.id}]`);
    }
  }
  return `\n\nMENCIONES EN ESTE MENSAJE:\n${lines.join("\n")}\n\nUsa estas referencias con precisión cuando respondas.`;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return jsonError(500, "Algo salió mal en LIA. Intenta de nuevo.");

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonError(401, "Sesión inválida.");
        }

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userRes, error: userErr } = await sb.auth.getUser();
        if (userErr || !userRes.user) return jsonError(401, "Sesión inválida.");

        let body: { messages: { role: "user" | "assistant"; content: string }[]; timezone?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Petición inválida.");
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return jsonError(400, "Faltan mensajes.");
        }

        try {
          const timezone = body.timezone || USER_TZ;
          const ctx = await buildContext(sb, timezone);
          const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
          const mentionsBlock = await buildMentionsBlock(sb, lastUser);
          const system = buildSystemPrompt(ctx) + mentionsBlock;

          if (isPlanRequest(body.messages)) {
            const planText = await buildTaskPlanResponse(sb, body.messages, timezone, ctx.name);
            return new Response(planText, {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }

          const uiMessages: UIMessage[] = body.messages.slice(-20).map((m, i) => ({
            id: String(i),
            role: m.role,
            parts: [{ type: "text", text: m.content }],
          } as UIMessage));

          const gateway = createLovableAiGatewayProvider(apiKey);
          const result = streamText({
            model: gateway(DEFAULT_MODEL),
            system,
            messages: await convertToModelMessages(uiMessages),
            maxOutputTokens: 4000,
          });
          return result.toTextStreamResponse();
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (/429|rate/i.test(msg)) {
            return jsonError(429, "LIA está ocupada ahora, intenta en un momento.");
          }
          if (/402|credit/i.test(msg)) {
            return jsonError(402, "Sin créditos en Lovable AI. Agrega créditos en Settings → Workspace → Usage.");
          }
          return jsonError(500, "Algo salió mal en LIA. Intenta de nuevo.");
        }
      },
    },
  },
});
