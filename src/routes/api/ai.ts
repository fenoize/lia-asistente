import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { buildContext } from "@/lib/ai/context-builder";
import { buildSystemPrompt } from "@/lib/ai/prompts";
import { extractMentions } from "@/lib/mentions";

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
    if (t.status !== "done") tasksByProject.set(t.project_id, (tasksByProject.get(t.project_id) ?? 0) + 1);
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
        if (!apiKey) return jsonError(500, "Algo salió mal en Alfred. Intenta de nuevo.");

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

        let body: { messages: { role: "user" | "assistant"; content: string }[] };
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Petición inválida.");
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return jsonError(400, "Faltan mensajes.");
        }

        try {
          const ctx = await buildContext(sb);
          const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
          const mentionsBlock = await buildMentionsBlock(sb, lastUser);
          const system = buildSystemPrompt(ctx) + mentionsBlock;

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
          });
          return result.toTextStreamResponse();
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (/429|rate/i.test(msg)) {
            return jsonError(429, "Alfred está ocupado ahora, intenta en un momento.");
          }
          if (/402|credit/i.test(msg)) {
            return jsonError(402, "Sin créditos en Lovable AI. Agrega créditos en Settings → Workspace → Usage.");
          }
          return jsonError(500, "Algo salió mal en Alfred. Intenta de nuevo.");
        }
      },
    },
  },
});
