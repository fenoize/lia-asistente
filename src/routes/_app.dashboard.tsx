import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { supabase } from "@/integrations/supabase/client";
import {
  IconRefresh,
  IconBell,
  IconCheck,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
};
type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
};
type Reminder = { id: string; title: string; datetime: string; done: boolean };

function Dashboard() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const fetchedBriefRef = useRef(false);

  const today = new Date();
  const hour = today.getHours();
  const greeting =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profile, t, m, r] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase
          .from("tasks")
          .select("*")
          .eq("status", "pending")
          .order("due_date", { ascending: true })
          .limit(20),
        supabase
          .from("meetings")
          .select("*")
          .gte("datetime", startOfDay.toISOString())
          .lte("datetime", endOfDay.toISOString())
          .order("datetime"),
        supabase
          .from("reminders")
          .select("*")
          .eq("done", false)
          .gte("datetime", startOfDay.toISOString())
          .lte("datetime", endOfDay.toISOString())
          .order("datetime"),
      ]);
      setName((profile.data?.name ?? "").split(" ")[0] || "");
      setTasks((t.data as Task[]) ?? []);
      setMeetings((m.data as Meeting[]) ?? []);
      setReminders((r.data as Reminder[]) ?? []);

      const todayStr = today.toISOString().slice(0, 10);
      const { data: existing } = await supabase
        .from("daily_briefs")
        .select("content")
        .eq("date", todayStr)
        .maybeSingle();
      if (existing) {
        setBrief(existing.content);
        fetchedBriefRef.current = true;
      } else if (!fetchedBriefRef.current) {
        fetchedBriefRef.current = true;
        generateBrief();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const generateBrief = async () => {
    if (!user) return;
    setBriefLoading(true);
    setBrief("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/daily-brief", {
        method: "POST",
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
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
      const todayStr = today.toISOString().slice(0, 10);
      await supabase.from("daily_briefs").upsert(
        { user_id: user.id, content: acc, date: todayStr } as any,
        { onConflict: "user_id,date" } as any,
      );
    } catch {
      toast.error("No pude generar el resumen ahora.");
    } finally {
      setBriefLoading(false);
    }
  };

  const isOverdue = (d: string | null) =>
    !!d && new Date(d).getTime() < startOfDay.getTime();
  const isToday = (d: string | null) =>
    !!d &&
    new Date(d).getTime() >= startOfDay.getTime() &&
    new Date(d).getTime() <= endOfDay.getTime();

  const urgentTasks = tasks.filter(
    (t) => t.priority === "high" || isToday(t.due_date) || isOverdue(t.due_date),
  );
  const visibleTasks = showAllTasks ? urgentTasks : urgentTasks.slice(0, 4);

  const toggleTask = async (task: Task) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: "done" } : t)),
    );
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", task.id);
    if (error) {
      toast.error("No pude actualizar.");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: "pending" } : t)),
      );
    } else {
      // small celebratory: remove from list after a beat
      setTimeout(
        () => setTasks((prev) => prev.filter((t) => t.id !== task.id)),
        450,
      );
    }
  };

  const dateLabel = today
    .toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div>
      {/* Greeting */}
      <header style={{ marginBottom: 32 }}>
        <h1 className="alfred-h1">
          {greeting}{name ? `, ${name}` : ""}. Soy {assistant.name}.
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {dateLabel}
        </p>
      </header>

      {/* Daily Brief */}
      <section
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderLeft: "2px solid var(--accent-color)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          marginBottom: 32,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span
              style={{
                fontSize: 10,
                color: "var(--accent-color)",
                letterSpacing: "0.1em",
                fontWeight: 600,
              }}
            >
              {assistant.name.toUpperCase()}
            </span>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              Resumen del día
            </span>
          </div>
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            aria-label="Regenerar resumen"
            style={{ color: "var(--text-tertiary)" }}
            className="hover:opacity-100 opacity-70 transition"
          >
            <IconRefresh
              size={14}
              stroke={1.75}
              style={
                briefLoading
                  ? { animation: "alfredSpin 0.9s linear infinite" }
                  : undefined
              }
            />
          </button>
        </div>

        {brief ? (
          <div
            className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mt-3"
            style={{
              opacity: briefLoading ? 0.5 : 1,
              transition: "opacity 0.2s",
              color: "var(--text-primary)",
            }}
          >
            <ReactMarkdown>{brief}</ReactMarkdown>
          </div>
        ) : briefLoading ? (
          <Skeleton />
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            Sin resumen aún. Toca el ícono para generarlo.
          </p>
        )}
      </section>

      {/* Meetings */}
      <Block label="HOY">
        {meetings.length === 0 ? (
          <Empty>Sin reuniones hoy. Buen día para ejecutar.</Empty>
        ) : (
          <div className="space-y-2">
            {meetings.slice(0, 3).map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </Block>

      {/* Urgent tasks */}
      <Block label="URGENTE">
        {urgentTasks.length === 0 ? (
          <Empty>Cero urgencias. Bien.</Empty>
        ) : (
          <div className="space-y-1.5">
            {visibleTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                overdue={isOverdue(t.due_date)}
                onToggle={() => toggleTask(t)}
              />
            ))}
            {urgentTasks.length > 4 && !showAllTasks && (
              <button
                onClick={() => setShowAllTasks(true)}
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  marginTop: 8,
                  paddingLeft: 4,
                }}
                className="hover:text-foreground transition-colors"
              >
                + {urgentTasks.length - 4} más
              </button>
            )}
          </div>
        )}
      </Block>

      {/* Reminders */}
      <Block label="RECORDATORIOS">
        {reminders.length === 0 ? (
          <Empty>Sin recordatorios para hoy.</Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {reminders.map((r) => (
              <ReminderPill key={r.id} reminder={r} />
            ))}
          </div>
        )}
      </Block>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          letterSpacing: "0.1em",
          fontWeight: 500,
          marginBottom: 12,
          paddingLeft: 4,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{ fontSize: 13, color: "var(--text-tertiary)", paddingLeft: 4 }}
    >
      {children}
    </p>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const time = new Date(meeting.datetime).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <div
      className="flex items-center gap-4 transition-colors"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "12px 16px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-elevated)";
        e.currentTarget.style.borderColor = "var(--accent-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--accent-color)",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {time}
      </span>
      <span
        style={{
          width: 1,
          height: 32,
          background: "var(--border)",
        }}
      />
      <span
        className="flex-1 truncate"
        style={{ fontSize: 14, color: "var(--text-primary)" }}
      >
        {meeting.title}
      </span>
      {meeting.duration_minutes && (
        <span
          style={{
            fontSize: 11,
            background: "var(--bg-hover)",
            color: "var(--text-secondary)",
            borderRadius: "var(--radius-pill)",
            padding: "3px 10px",
          }}
        >
          {meeting.duration_minutes}m
        </span>
      )}
    </div>
  );
}

function TaskRow({
  task,
  overdue,
  onToggle,
}: {
  task: Task;
  overdue: boolean;
  onToggle: () => void;
}) {
  const done = task.status === "done";
  return (
    <div
      className="flex items-center gap-3 group"
      style={{
        padding: "8px 4px",
        opacity: done ? 0.4 : 1,
        transition: "opacity 0.3s",
      }}
    >
      <button
        onClick={onToggle}
        aria-label="Completar tarea"
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1.5px solid ${done ? "var(--accent-color)" : "var(--border)"}`,
          background: done ? "var(--accent-color)" : "transparent",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!done) e.currentTarget.style.borderColor = "var(--accent-color)";
        }}
        onMouseLeave={(e) => {
          if (!done) e.currentTarget.style.borderColor = "var(--border)";
        }}
      >
        {done && <IconCheck size={10} stroke={3} color="white" />}
      </button>
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 14,
          color: "var(--text-primary)",
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {task.title}
      </span>
      {overdue && !done && (
        <span
          style={{
            fontSize: 10,
            background: "oklch(0.65 0.21 25 / 16%)",
            color: "oklch(0.75 0.18 25)",
            borderRadius: "var(--radius-pill)",
            padding: "2px 8px",
            fontWeight: 500,
          }}
        >
          atrasada
        </span>
      )}
    </div>
  );
}

function ReminderPill({ reminder }: { reminder: Reminder }) {
  const time = new Date(reminder.datetime).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <div
      className="inline-flex items-center gap-2"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-pill)",
        padding: "6px 12px",
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      <IconBell size={12} stroke={1.75} style={{ color: "var(--accent-color)" }} />
      <span style={{ color: "var(--text-primary)" }}>{reminder.title}</span>
      <span style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        {time}
      </span>
    </div>
  );
}

function Skeleton() {
  const line = (w: string) => (
    <div
      style={{
        height: 10,
        width: w,
        borderRadius: 4,
        background:
          "linear-gradient(90deg, var(--bg-hover) 0%, var(--bg-surface) 50%, var(--bg-hover) 100%)",
        backgroundSize: "800px 100%",
        animation: "alfredShimmer 1.6s infinite linear",
      }}
    />
  );
  return (
    <div className="space-y-2.5 py-1">
      {line("100%")}
      {line("88%")}
      {line("60%")}
    </div>
  );
}
