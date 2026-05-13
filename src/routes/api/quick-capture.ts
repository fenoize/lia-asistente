import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";

const SYSTEM = `Eres un clasificador. Recibes texto crudo del usuario en español de Chile.
Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{
  "type": "task" | "meeting" | "reminder" | "note" | "project",
  "title": string (corto, claro, máx 80 chars),
  "description": string | null,
  "datetime": ISO8601 string | null,
  "priority": "low" | "medium" | "high" | null,
  "duration_minutes": number | null
}
Reglas:
- "task" si es algo que hay que hacer (con o sin fecha).
- "meeting" si menciona reunión, cita, llamada, junta o "call" con alguien.
- "reminder" si dice "recuérdame" o es una alerta puntual sin acción compleja.
- "note" si es una idea, observación o pensamiento sin acción.
- "project" si el texto indica crear o iniciar un nuevo proyecto o iniciativa grande.
- title: resumen MUY breve y específico. Para reuniones usa formato "Reunión con <persona/empresa>". NO incluyas la fecha/hora ni la descripción de lo que se hará en el título.
- description: redacta en una frase clara lo que se hará o se tratará. Reformula el texto del usuario en tercera persona o impersonal (ej: "Se revisará la configuración..."). NO repitas el título ni incluyas la fecha. Si no hay nada que describir, null.
- datetime: parsea fechas y horas en español ("hoy a las 16:00", "mañana 3pm", "el viernes", "en 2 horas") a ISO8601 con offset de America/Santiago. "hoy a las HH:MM" SIEMPRE significa hoy en esa hora exacta, nunca la hora actual. Si no hay fecha/hora explícita, null.
- priority solo aplica a "task". Default "medium".
- Sin texto extra. Solo JSON, sin code fences.`;

const Schema = z.object({
  type: z.enum(["task", "meeting", "reminder", "note", "project"]),
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
        const nowSantiago = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "America/Santiago",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hour12: false,
        }).format(new Date()).replace(" ", "T");
        const { text: raw } = await generateText({
          model: gateway(DEFAULT_MODEL),
          system: SYSTEM + `\nFecha y hora actual en America/Santiago (zona del usuario): ${nowSantiago}-03:00. Usa este offset al generar datetimes.`,
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
