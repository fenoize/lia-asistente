import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { buildContext } from "@/lib/ai/context-builder";
import { buildSystemPrompt } from "@/lib/ai/prompts";

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
          const system = buildSystemPrompt(ctx);

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
