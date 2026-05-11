import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";

const SYSTEM = `Eres Alfred, un asistente ejecutivo personal. Hablas español de Chile, tuteas (usas "tú").
Reglas:
- Sin preámbulos. Sin "claro, puedo ayudarte". Vas directo.
- Calmado, inteligente, breve. Como un buen jefe de gabinete.
- Markdown ligero cuando ayude (listas cortas, negritas para lo importante).
- Si no sabes algo, lo dices.

Cuando quieras crear una tarea, reunión, recordatorio o nota, NO la crees tú.
En vez de eso, al final de tu mensaje agrega un bloque de código con la acción propuesta, así:

\`\`\`action
{"type":"task|meeting|reminder|note","title":"...","description":"...","datetime":"ISO|null","priority":"low|medium|high|null","duration_minutes":number|null}
\`\`\`

El usuario verá una tarjeta de confirmación y decidirá. No expliques el bloque.`;

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          context?: {
            name?: string;
            now?: string;
            tasks?: Array<{ title: string; due_date: string | null; priority: string; status: string }>;
            meetings?: Array<{ title: string; datetime: string }>;
            reminders?: Array<{ title: string; datetime: string }>;
          };
        };

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway(DEFAULT_MODEL);

        const ctx = body.context;
        const ctxText = ctx
          ? `\n\nContexto del usuario (${ctx.now ?? new Date().toISOString()}, America/Santiago):
- Nombre: ${ctx.name ?? "desconocido"}
- Tareas pendientes: ${(ctx.tasks ?? []).slice(0, 15).map(t => `[${t.priority}] ${t.title}${t.due_date ? ` (vence ${t.due_date})` : ""}`).join("; ") || "ninguna"}
- Reuniones próximas: ${(ctx.meetings ?? []).slice(0, 10).map(m => `${m.title} @ ${m.datetime}`).join("; ") || "ninguna"}
- Recordatorios activos: ${(ctx.reminders ?? []).slice(0, 10).map(r => `${r.title} @ ${r.datetime}`).join("; ") || "ninguno"}`
          : "";

        const uiMessages: UIMessage[] = body.messages.map((m, i) => ({
          id: String(i),
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        } as UIMessage));

        const result = streamText({
          model,
          system: SYSTEM + ctxText,
          messages: await convertToModelMessages(uiMessages),
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
