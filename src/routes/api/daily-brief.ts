import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";
import { buildContext } from "@/lib/ai/context-builder";
import { buildBriefSystemPrompt } from "@/lib/ai/prompts";
import { USER_TZ } from "@/lib/timezone";

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/daily-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return jsonError(500, "Algo salió mal en LIA. Intenta de nuevo.");

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return jsonError(401, "Sesión inválida.");
        }

        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );

        const { data: userRes, error: userErr } = await sb.auth.getUser();
        if (userErr || !userRes.user) return jsonError(401, "Sesión inválida.");

        try {
          const timezone = request.headers.get("x-user-timezone") || USER_TZ;
          const ctx = await buildContext(sb, timezone);
          const gateway = createLovableAiGatewayProvider(apiKey);
          const result = streamText({
            model: gateway(DEFAULT_MODEL),
            system: buildBriefSystemPrompt(ctx),
            prompt: "Genera el resumen del día siguiendo exactamente la estructura indicada.",
          });
          return result.toTextStreamResponse();
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (/429|rate/i.test(msg)) {
            return jsonError(429, "LIA está ocupada ahora, intenta en un momento.");
          }
          if (/402|credit/i.test(msg)) {
            return jsonError(402, "Sin créditos en Lovable AI.");
          }
          return jsonError(500, "Algo salió mal en LIA. Intenta de nuevo.");
        }
      },
    },
  },
});
