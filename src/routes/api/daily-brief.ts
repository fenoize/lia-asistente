import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, DEFAULT_MODEL } from "@/lib/ai-gateway";

const SYSTEM = `Eres Alfred. Generas un resumen breve del día para el usuario.
- Español de Chile, tuteo.
- Sin preámbulos. Empieza con lo importante.
- Máximo 150 palabras.
- Estructura: 2-4 frases de contexto, luego una lista corta con bullets de lo crítico.
- Tono calmado, ejecutivo. No motivacional cursi.`;

export const Route = createFileRoute("/api/daily-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const authHeader = request.headers.get("authorization");
        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;

        let context = "";
        if (authHeader?.startsWith("Bearer ")) {
          const sb = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const end = new Date(); end.setHours(23, 59, 59, 999);
          const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(23, 59, 59, 999);

          const [tasks, meetings, reminders, profile] = await Promise.all([
            sb.from("tasks").select("title, priority, due_date, status").eq("status", "pending").limit(20),
            sb.from("meetings").select("title, datetime, duration_minutes").gte("datetime", start.toISOString()).lte("datetime", tomorrow.toISOString()),
            sb.from("reminders").select("title, datetime").eq("done", false).gte("datetime", start.toISOString()).lte("datetime", tomorrow.toISOString()),
            sb.from("profiles").select("name, role, goals").maybeSingle(),
          ]);
          context = JSON.stringify({
            today: start.toISOString(),
            profile: profile.data,
            meetings: meetings.data,
            reminders: reminders.data,
            tasks: tasks.data,
          }, null, 2);
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway(DEFAULT_MODEL),
          system: SYSTEM,
          prompt: `Datos del usuario para hoy y mañana:\n\n${context || "(sin datos)"}\n\nGenera el resumen del día.`,
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
