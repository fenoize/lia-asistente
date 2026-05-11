import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Clock, MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/meetings")({
  component: MeetingsPage,
});

function MeetingsPage() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setDate(end.getDate() + 14);
      const { data } = await supabase
        .from("meetings")
        .select("*")
        .gte("datetime", start.toISOString())
        .lte("datetime", end.toISOString())
        .order("datetime");
      setMeetings(data ?? []);
    })();
  }, [user]);

  // Group by day
  const groups: Record<string, any[]> = {};
  meetings.forEach((m) => {
    const key = new Date(m.datetime).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    (groups[key] ||= []).push(m);
  });

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Reuniones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Las próximas dos semanas.</p>
      </header>

      {Object.keys(groups).length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">Sin reuniones agendadas.</p>
      )}

      <div className="space-y-8">
        {Object.entries(groups).map(([day, items]) => (
          <section key={day}>
            <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 capitalize">{day}</h2>
            <div className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="surface-1 hairline rounded-xl px-4 py-3 flex items-start gap-4">
                  <div className="text-sm font-medium tabular-nums w-16 shrink-0 text-muted-foreground">
                    {new Date(m.datetime).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{m.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{m.duration_minutes ?? 60} min</span>
                      {m.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
