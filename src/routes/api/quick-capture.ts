import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";

const SYSTEM = `Eres un clasificador. Recibes texto crudo del usuario en español de Chile.
Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{
  "type": "task" | "meeting" | "reminder" | "note",
  "title": string (corto, claro),
  "description": string | null,
  "datetime": ISO8601 string | null,
  "priority": "low" | "medium" | "high" | null,
  "duration_minutes": number | null
}
Reglas:
- "task" si es algo que hay que hacer (con o sin fecha).
- "meeting" si menciona una reunión, cita, llamada con alguien a una hora específica.
- "reminder" si dice "recuérdame" o es una alerta puntual sin acción compleja.
- "note" si es una idea, observación o pensamiento sin acción.
- datetime: parsea fechas en español ("mañana 3pm", "el viernes", "en 2 horas") a ISO. Asume zona America/Santiago. Si no hay fecha, null.
- priority solo aplica a "task". Default "medium".
- Sin texto extra. Solo JSON.`;

const Schema = z.object({
  type: z.enum(["task", "meeting", "reminder", "note"]),
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  datetime: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  duration_minutes: z.number().int().positive().nullable().optional(),
});

export const Route = createFileRoute("/api/quick-capture")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { text } = await request.json() as { text: string };
        if (!text?.trim()) return new Response("Empty", { status: 400 });

        const gateway = createLovableAiGatewayProvider(apiKey);
        const now = new Date().toISOString();
        const { text: raw } = await generateText({
          model: gateway(DEFAULT_MODEL),
          system: SYSTEM + `\nFecha y hora actual: ${now} (America/Santiago).`,
          prompt: text,
        });

        // Strip code fences if present
        const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        let parsed;
        try {
          parsed = Schema.parse(JSON.parse(cleaned));
        } catch {
          // Fallback: treat as note
          parsed = { type: "note" as const, title: text.slice(0, 80), description: text };
        }

        return Response.json(parsed);
      },
    },
  },
});
