import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Calendar, CheckSquare, Bell, RefreshCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<string>("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);

  const today = new Date();
  const greetingHour = today.getHours();
  const greeting = greetingHour < 12 ? "Buenos días" : greetingHour < 19 ? "Buenas tardes" : "Buenas noches";

  const loadData = async () => {
    if (!user) return;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);

    const [t, m, r] = await Promise.all([
      supabase.from("tasks").select("*").eq("status", "pending").order("due_date", { ascending: true }).limit(6),
      supabase.from("meetings").select("*").gte("datetime", startOfDay.toISOString()).lte("datetime", weekAhead.toISOString()).order("datetime").limit(5),
      supabase.from("reminders").select("*").eq("done", false).gte("datetime", startOfDay.toISOString()).order("datetime").limit(5),
    ]);
    setTasks(t.data ?? []);
    setMeetings(m.data ?? []);
    setReminders(r.data ?? []);

    const todayStr = today.toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("daily_briefs")
      .select("content")
      .eq("date", todayStr)
      .maybeSingle();
    if (existing) setBrief(existing.content);
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [user]);

  const generateBrief = async () => {
    if (!user) return;
    setBriefLoading(true);
    setBrief("");
    try {
      const res = await fetch("/api/daily-brief", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setBrief(acc);
      }
      // Persist
      const todayStr = today.toISOString().slice(0, 10);
      await supabase.from("daily_briefs").upsert({
        user_id: user.id,
        content: acc,
        date: todayStr,
      } as any, { onConflict: "user_id,date" } as any);
    } catch (e: any) {
      toast.error("No pude generar el resumen ahora.");
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 md:py-14">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {today.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">{greeting}.</h1>
      </header>

      {/* Daily Brief */}
      <section className="surface-1 hairline rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Tu resumen del día
          </div>
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1"
          >
            <RefreshCcw className={`h-3 w-3 ${briefLoading ? "animate-spin" : ""}`} />
            {brief ? "Regenerar" : "Generar"}
          </button>
        </div>
        {brief ? (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:text-foreground">
            <ReactMarkdown>{brief}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {briefLoading ? "Pensando…" : "Genera un resumen de tu día y prioridades."}
          </p>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Próximas reuniones" icon={Calendar} href="/reuniones" empty="Sin reuniones por ahora.">
          {meetings.map((m) => (
            <Row
              key={m.id}
              title={m.title}
              meta={new Date(m.datetime).toLocaleString("es-CL", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            />
          ))}
        </Card>

        <Card title="Tareas urgentes" icon={CheckSquare} href="/tareas" empty="Cero pendientes. Bien.">
          {tasks.map((t) => (
            <Row
              key={t.id}
              title={t.title}
              meta={t.due_date ? new Date(t.due_date).toLocaleDateString("es-CL", { day: "numeric", month: "short" }) : "Sin fecha"}
              accent={t.priority === "high"}
            />
          ))}
        </Card>

        <Card title="Recordatorios" icon={Bell} href="/recordatorios" empty="Nada que recordar.">
          {reminders.map((r) => (
            <Row
              key={r.id}
              title={r.title}
              meta={new Date(r.datetime).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            />
          ))}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, href, children, empty }: any) {
  const items = Array.isArray(children) ? children : [children];
  const hasContent = items.some((c) => c);
  return (
    <Link to={href} className="surface-1 hairline rounded-2xl p-5 hover:bg-surface-2 transition block">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {hasContent ? <div className="space-y-2.5">{children}</div> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </Link>
  );
}

function Row({ title, meta, accent }: { title: string; meta: string; accent?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-foreground line-clamp-1">
        {accent && <span className="inline-block h-1.5 w-1.5 rounded-full bg-priority-high mr-2 align-middle" />}
        {title}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">{meta}</span>
    </div>
  );
}
