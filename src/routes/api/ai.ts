import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";

const SYSTEM = `Eres Alfred, un asistente ejecutivo personal. Hablas español de Chile, tuteas (usas "tú").
Reglas:
- Sin preámbulos. Sin "claro, puedo ayudarte". Vas directo.
- Calmado, inteligente, breve. Como un buen jefe de gabinete.
- Si vas a sugerir crear una tarea, reunión, recordatorio o nota, dilo y pide confirmación. Nunca asumas.
- Markdown ligero cuando ayude (listas cortas, negritas para lo importante).
- Si no sabes algo, lo dices.`;

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = await request.json() as { messages: { role: "user" | "assistant"; content: string }[] };
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway(DEFAULT_MODEL);

        // Build UIMessages from raw role/content pairs
        const uiMessages: UIMessage[] = body.messages.map((m, i) => ({
          id: String(i),
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        } as UIMessage));

        const result = streamText({
          model,
          system: SYSTEM,
          messages: await convertToModelMessages(uiMessages),
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
