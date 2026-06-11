import { createFileRoute, Link } from "@tanstack/react-router";
import { EditMeetingModal } from "@/components/meetings/edit-meeting-modal";
import { EditTaskModal, type EditableTask } from "@/components/tasks/edit-task-modal";
import { EditReminderModal } from "@/components/reminders/edit-reminder-modal";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useAssistant } from "@/hooks/use-assistant";
import { usePrefetchStore } from "@/hooks/use-prefetch-store";
import { supabase } from "@/integrations/supabase/client";
import {
  IconRefresh,
  IconBell,
  IconCheck,
  IconCake,
  IconAlertTriangle,
  IconAlertCircle,
  IconCalendar,
  IconClock,
  IconSparkles,
  IconFolder,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { currentDateInTimeZone, detectUserTimeZone, formatTimeInTimeZone, getDayRangeUTC } from "@/lib/timezone";
import {
  PriorityActionsWidget,
  WeeklyInsightsWidget,
  ActiveProjectsWidget,
  FinanceSnapshotWidget,
} from "@/components/dashboard/intelligent-widgets";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
  project_id: string | null;
  assigned_to: string | null;
};
type Meeting = {
  id: string;
  title: string;
  datetime: string;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  preparation_needed: boolean | null;
};
type Reminder = { id: string; title: string; datetime: string; done: boolean };
type BirthdayContact = {
  id: string;
  name: string;
  birthday: string;
  context: string | null;
  daysUntil: number;
};

function daysUntil(birthdayIso: string): number {
  const [, m, d] = birthdayIso.split("-").map(Number);
  if (!m || !d) return 999;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}


function Dashboard() {
  const { user } = useAuth();
  const assistant = useAssistant();
  const userTimeZone = detectUserTimeZone();
  const prefetch = usePrefetchStore();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => (prefetch.data?.tasks as Task[]) ?? []);
  const [meetings, setMeetings] = useState<Meeting[]>(() => (prefetch.data?.meetings as Meeting[]) ?? []);
  const [reminders, setReminders] = useState<Reminder[]>(() => (prefetch.data?.reminders as Reminder[]) ?? []);
  const [birthdays, setBirthdays] = useState<BirthdayContact[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>(() => prefetch.data?.projects ?? []);
  const [allContacts, setAllContacts] = useState<{ id: string; name: string }[]>([]);
  const [monthProgress, setMonthProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const [briefStaleness, setBriefStaleness] = useState<{ hasBrief: boolean; hasChanges: boolean }>({ hasBrief: false, hasChanges: false });
  const fetchedBriefRef = useRef(false);

  const reloadMeetings = async () => {
    if (!user) return;
    const todayRange = getDayRangeUTC(userTimeZone);
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .gte("datetime", todayRange.startIso)
      .lt("datetime", todayRange.endExclusiveIso)
      .order("datetime");
    setMeetings((data as Meeting[]) ?? []);
  };

  const today = new Date();
  const hour = today.getHours();
  const greeting =
    hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  const todayRange = getDayRangeUTC(userTimeZone);
  const startOfDay = new Date(todayRange.startIso);
  const endOfDay = new Date(todayRange.endExclusiveIso);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profile, t, m, r, c, p] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase
          .from("tasks")
          .select("*")
          .order("due_date", { ascending: true })
          .limit(80),
        supabase
          .from("meetings")
          .select("*")
          .gte("datetime", todayRange.startIso)
          .lt("datetime", todayRange.endExclusiveIso)
          .order("datetime"),
        supabase
          .from("reminders")
          .select("*")
          .eq("done", false)
          .gte("datetime", todayRange.startIso)
          .lt("datetime", todayRange.endExclusiveIso)
          .order("datetime"),
        supabase
          .from("contacts")
          .select("id,name,birthday,context"),
        supabase.from("projects").select("id,name").order("name"),
      ]);
      setName((profile.data?.name ?? "").split(" ")[0] || "");
      setTasks((t.data as Task[]) ?? []);
      setMeetings((m.data as Meeting[]) ?? []);
      setReminders((r.data as Reminder[]) ?? []);
      setProjects((p.data as { id: string; name: string }[]) ?? []);
      setAllContacts(((c.data as any[]) ?? []).map((row) => ({ id: row.id, name: row.name })));

      // Month progress: tasks created this month, done vs total
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [totalRes, doneRes] = await Promise.all([
        supabase.from("tasks").select("id", { head: true, count: "exact" }).gte("created_at", monthStart.toISOString()),
        supabase.from("tasks").select("id", { head: true, count: "exact" }).eq("status", "listo").gte("created_at", monthStart.toISOString()),
      ]);
      setMonthProgress({ done: doneRes.count ?? 0, total: totalRes.count ?? 0 });
      const upcoming = ((c.data as any[]) ?? [])
        .filter((row) => !!row.birthday)
        .map((row) => ({
          id: row.id,
          name: row.name,
          birthday: row.birthday as string,
          context: row.context as string | null,
          daysUntil: daysUntil(row.birthday),
        }))
        .filter((b) => b.daysUntil <= 3)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      setBirthdays(upcoming);




      const todayStr = currentDateInTimeZone(userTimeZone);
      const { data: existing } = await supabase
        .from("daily_briefs")
        .select("content,generated_at")
        .eq("date", todayStr)
        .maybeSingle();
      if (existing) {
        setBrief(existing.content);
        fetchedBriefRef.current = true;
        // Detect changes since brief generation
        const since = existing.generated_at as string;
        const [tNew, tUpd, mNew, rNew] = await Promise.all([
          supabase.from("tasks").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gt("created_at", since),
          supabase.from("tasks").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gt("updated_at", since),
          supabase.from("meetings").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gt("created_at", since),
          supabase.from("reminders").select("id", { head: true, count: "exact" }).eq("user_id", user.id).gt("created_at", since),
        ]);
        const hasChanges = (tNew.count ?? 0) + (tUpd.count ?? 0) + (mNew.count ?? 0) + (rNew.count ?? 0) > 0;
        setBriefStaleness({ hasBrief: true, hasChanges });
      } else if (!fetchedBriefRef.current) {
        fetchedBriefRef.current = true;
        generateBrief();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userTimeZone]);

  const generateBrief = async () => {
    if (!user) return;
    setBriefLoading(true);
    setBrief("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/daily-brief", {
        method: "POST",
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          "x-user-timezone": userTimeZone,
        },
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
      const todayStr = currentDateInTimeZone(userTimeZone);
      await supabase.from("daily_briefs").upsert(
        { user_id: user.id, content: acc, date: todayStr } as any,
        { onConflict: "user_id,date" } as any,
      );
      setBriefStaleness({ hasBrief: true, hasChanges: false });
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

  // Tasks for today's view: due today, overdue (pending), or pending high priority
  const todayTasks = tasks.filter((t) => {
    if (isToday(t.due_date)) return true;
    if (t.status !== "listo") {
      if (isOverdue(t.due_date)) return true;
      if (t.priority === "high") return true;
    }
    return false;
  });
  const [completedAt, setCompletedAt] = useState<Record<string, number>>({});
  const pendingTodayTasks = todayTasks.filter((t) => t.status !== "listo");
  const doneTodayTasks = useMemo(
    () =>
      todayTasks
        .filter((t) => t.status === "listo")
        .sort((a, b) => (completedAt[a.id] ?? 0) - (completedAt[b.id] ?? 0)),
    [todayTasks, completedAt],
  );
  const overdueCount = tasks.filter(
    (t) => t.status !== "listo" && isOverdue(t.due_date),
  ).length;

  const projectMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.name;
    return map;
  }, [projects]);
  const contactMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allContacts) map[c.id] = c.name;
    return map;
  }, [allContacts]);

  const visiblePending = showAllTasks ? pendingTodayTasks : pendingTodayTasks.slice(0, 4);

  const upcomingMeetings = meetings.filter(
    (m) => new Date(m.datetime).getTime() + (m.duration_minutes || 60) * 60000 > Date.now()
  );
  const nextMeeting = upcomingMeetings[0] ?? null;
  
  const pastMeetingsWithoutNotes = meetings.filter(
    (m) => new Date(m.datetime).getTime() + (m.duration_minutes || 60) * 60000 <= Date.now() && (!m.notes || m.notes.trim() === "")
  );

  // Combined timeline: reminders first (sorted by time), then meetings (sorted by time).
  type TimelineItem =
    | { kind: "reminder"; id: string; datetime: string; data: Reminder }
    | { kind: "meeting"; id: string; datetime: string; data: Meeting };
  const sortedReminders = [...reminders].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
  );
  const sortedMeetings = [...upcomingMeetings].sort(
    (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime(),
  );
  const timeline: TimelineItem[] = [
    ...sortedReminders.map((r) => ({ kind: "reminder" as const, id: r.id, datetime: r.datetime, data: r })),
    ...sortedMeetings.map((m) => ({ kind: "meeting" as const, id: m.id, datetime: m.datetime, data: m })),
  ];

  const toggleTask = async (task: Task) => {
    const wasDone = task.status === "listo";
    const newStatus = wasDone ? "borrador" : "listo";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
    );
    if (!wasDone) {
      setCompletedAt((prev) => ({ ...prev, [task.id]: Date.now() }));
    } else {
      setCompletedAt((prev) => {
        const { [task.id]: _, ...rest } = prev;
        return rest;
      });
    }
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", task.id);
    if (error) {
      toast.error("No pude actualizar.");
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
      );
    }
  };

  const toggleReminder = async (r: Reminder) => {
    const next = !r.done;
    setReminders((prev) =>
      next ? prev.filter((x) => x.id !== r.id) : prev.map((x) => (x.id === r.id ? { ...x, done: false } : x)),
    );
    const { error } = await supabase.from("reminders").update({ done: next }).eq("id", r.id);
    if (error) {
      toast.error("No pude actualizar.");
      setReminders((prev) => (next ? [...prev, r] : prev));
    }
  };

  const dateLabel = today
    .toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div>
      {/* Greeting */}
      <header style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "#f2f2f2",
            lineHeight: 1.15,
          }}
        >
          {greeting}{name ? `, ${name}` : ""}.
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
          {dateLabel}
        </p>
      </header>

      {/* 1. Resumen de LIA */}
      <section
        style={{
          background: "#111111",
          border: "1px solid #1e1e1e",
          borderLeft: "3px solid #6366f1",
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 24,
          position: "relative",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <IconSparkles size={16} stroke={1.75} style={{ color: "#a78bfa" }} />
            <span
              style={{
                fontSize: 10,
                color: "#a78bfa",
                letterSpacing: "0.12em",
                fontWeight: 700,
              }}
            >
              {assistant.name.toUpperCase()}
            </span>
          </div>
          {(briefStaleness.hasChanges || !briefStaleness.hasBrief || briefLoading) && (
            <button
              onClick={generateBrief}
              disabled={briefLoading}
              aria-label="Actualizar resumen"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 500,
                color: "#a78bfa",
                background: "rgba(139,92,246,0.1)",
                border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: 999,
                padding: "3px 10px",
                cursor: briefLoading ? "not-allowed" : "pointer",
                opacity: briefLoading ? 0.7 : 1,
              }}
            >
              {briefLoading ? "…" : "Actualizar"}
              <IconRefresh
                size={11}
                stroke={2}
                style={briefLoading ? { animation: "alfredSpin 0.9s linear infinite" } : undefined}
              />
            </button>
          )}
        </div>

        {brief ? (
          <BriefCompact text={brief} />
        ) : briefLoading ? (
          <Skeleton />
        ) : (
          <p style={{ fontSize: 13, color: "#666" }}>
            Sin resumen aún.
          </p>
        )}
      </section>

      {/* Priority actions (smart ranking) */}
      <PriorityActionsWidget
        tasks={tasks}
        reminders={reminders}
        meetings={meetings}
        projectMap={projectMap}
      />

      {/* Birthday alerts (small, optional) */}
      {birthdays.map((b) => {
        const when =
          b.daysUntil === 0
            ? `Hoy es el cumpleaños de ${b.name}.`
            : b.daysUntil === 1
              ? `Mañana es el cumpleaños de ${b.name}.`
              : `En ${b.daysUntil} días es el cumpleaños de ${b.name}.`;
        return (
          <div
            key={b.id}
            className="flex items-center gap-3"
            style={{
              background: "rgba(217,119,6,0.05)",
              border: "1px solid rgba(217,119,6,0.15)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 12,
            }}
          >
            <IconCake size={14} stroke={1.75} color="#fbbf24" />
            <span style={{ fontSize: 13, color: "#e0e0e0", flex: 1 }}>{when}</span>
            <Link to="/meetings" style={{ fontSize: 12, color: "#fbbf24", whiteSpace: "nowrap" }}>
              Agendar →
            </Link>
          </div>
        );
      })}

      {/* 2. Requiere atención */}
      <Block label="REQUIERE ATENCIÓN">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <AttentionMiniCard
            to="/tasks"
            icon={<IconAlertCircle size={16} stroke={1.75} color="#f87171" />}
            label="Vencidas"
            valueNode={
              <span style={{ color: "#f87171" }}>{overdueCount}</span>
            }
            hint="tareas"
          />
          <AttentionMiniCard
            to="/meetings"
            icon={<IconCalendar size={16} stroke={1.75} color="#818cf8" />}
            label="Reunión"
            valueNode={
              nextMeeting ? (
                <span style={{ color: "#f2f2f2" }}>
                  {formatTimeInTimeZone(nextMeeting.datetime, detectUserTimeZone())}
                </span>
              ) : (
                <span style={{ color: "#444" }}>—</span>
              )
            }
            hint={nextMeeting ? timeUntil(nextMeeting.datetime) : "sin próximas"}
          />
          <AttentionMiniCard
            to="/tasks"
            icon={<IconCheck size={16} stroke={2.5} color="#4ade80" />}
            label="Progreso"
            valueNode={
              <>
                <span style={{ color: "#f2f2f2" }}>{monthProgress.done}</span>
                <span style={{ color: "#444" }}>/{monthProgress.total}</span>
              </>
            }
            hint="este mes"
          />
        </div>
      </Block>


      {/* 3. Recordatorios y eventos (combinado) */}
      {timeline.length > 0 && (
        <Block label="RECORDATORIOS Y EVENTOS">
          <div className="space-y-2">
            {timeline.map((item) =>
              item.kind === "reminder" ? (
                <ReminderPill key={`r-${item.id}`} reminder={item.data} onClick={() => setEditingReminder(item.data)} onComplete={() => toggleReminder(item.data)} />
              ) : (
                <MeetingRow
                  key={`m-${item.id}`}
                  meeting={item.data}
                  onClick={() => setEditingMeeting(item.data)}
                />
              ),
            )}
          </div>
        </Block>
      )}

      {/* Pendiente de resumen (kept) */}
      {pastMeetingsWithoutNotes.length > 0 && (
        <Block label="PENDIENTE DE RESUMEN">
          <div className="space-y-2">
            {pastMeetingsWithoutNotes.map((m) => (
              <MeetingRow
                key={m.id}
                meeting={m}
                onClick={() => setEditingMeeting(m)}
                isPastNeedsNotes
              />
            ))}
          </div>
        </Block>
      )}

      {/* 4. Tareas del día */}
      {(pendingTodayTasks.length > 0 || doneTodayTasks.length > 0) && (
        <Block label="TAREAS DEL DÍA">
          <div
            style={{
              background: "#111111",
              border: "1px solid #1e1e1e",
              borderRadius: 12,
              padding: 8,
            }}
          >
            <LayoutGroup>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {visiblePending.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    overdue={isOverdue(t.due_date)}
                    projectName={t.project_id ? projectMap[t.project_id] : undefined}
                    assigneeName={t.assigned_to ? contactMap[t.assigned_to] : undefined}
                    onToggle={() => toggleTask(t)}
                    onOpen={() => setEditingTask(t)}
                  />
                ))}
                {pendingTodayTasks.length > 4 && !showAllTasks && (
                  <button
                    onClick={() => setShowAllTasks(true)}
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      marginTop: 4,
                      paddingLeft: 10,
                      textAlign: "left",
                    }}
                    className="hover:text-foreground transition-colors"
                  >
                    + {pendingTodayTasks.length - 4} más
                  </button>
                )}
                {doneTodayTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    overdue={false}
                    projectName={t.project_id ? projectMap[t.project_id] : undefined}
                    assigneeName={t.assigned_to ? contactMap[t.assigned_to] : undefined}
                    onToggle={() => toggleTask(t)}
                    onOpen={() => setEditingTask(t)}
                  />
                ))}
              </div>
            </LayoutGroup>
          </div>
        </Block>
      )}

      {/* Intelligent widgets */}
      {user && (
        <>
          <ActiveProjectsWidget userId={user.id} />
          <WeeklyInsightsWidget userId={user.id} />
          <FinanceSnapshotWidget userId={user.id} />
        </>
      )}



      {editingMeeting && (
        <EditMeetingModal
          meeting={editingMeeting}
          onClose={() => setEditingMeeting(null)}
          onSaved={async () => { setEditingMeeting(null); await reloadMeetings(); }}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask as EditableTask}
          projects={projects}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } as Task : t)));
            setEditingTask(null);
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setEditingTask(null);
          }}
        />
      )}

      <EditReminderModal
        reminder={editingReminder}
        open={!!editingReminder}
        onClose={() => setEditingReminder(null)}
        onSaved={(updated) => {
          setReminders((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated, done: updated.done ?? false } : r)));
          setEditingReminder(null);
        }}
      />
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
    <section>
      <div className="alfred-section-label">{label}</div>
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

function MeetingRow({ meeting, onClick, isPastNeedsNotes }: { meeting: Meeting; onClick?: () => void; isPastNeedsNotes?: boolean }) {
  const time = formatTimeInTimeZone(meeting.datetime, detectUserTimeZone());
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 transition-colors w-full text-left"
      style={{
        background: isPastNeedsNotes ? "rgba(251, 146, 60, 0.05)" : "#111111",
        border: isPastNeedsNotes ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid #1e1e1e",
        borderRadius: 10,
        padding: "12px 16px",
        cursor: onClick ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = isPastNeedsNotes ? "rgba(251, 146, 60, 0.4)" : "var(--accent-subtle)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isPastNeedsNotes ? "rgba(251, 146, 60, 0.2)" : "#1e1e1e";
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: isPastNeedsNotes ? "#fbbf24" : "#6366f1",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {time}
      </span>
      <span
        className="flex-1 truncate"
        style={{ fontSize: 14, color: isPastNeedsNotes ? "#f3f4f6" : "#e0e0e0" }}
      >
        {meeting.title}
      </span>
      {isPastNeedsNotes ? (
        <span
          style={{
            fontSize: 11,
            background: "rgba(251, 146, 60, 0.1)",
            border: "1px solid rgba(251, 146, 60, 0.2)",
            color: "#fbbf24",
            borderRadius: 100,
            padding: "2px 10px",
          }}
        >
          Agregar resumen →
        </span>
      ) : meeting.duration_minutes ? (
        <span
          style={{
            fontSize: 11,
            background: "#1a1a1a",
            border: "1px solid #222",
            color: "#666",
            borderRadius: 100,
            padding: "2px 10px",
          }}
        >
          {meeting.duration_minutes}m
        </span>
      ) : null}
    </button>
  );
}

function TaskRow({
  task,
  overdue,
  projectName,
  assigneeName,
  onToggle,
  onOpen,
}: {
  task: Task;
  overdue: boolean;
  projectName?: string;
  assigneeName?: string;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const done = task.status === "listo";
  const high = task.priority === "high";
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 400, damping: 36, duration: 0.35 }}
      className="flex items-start gap-3 group"
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        opacity: done ? 0.5 : 1,
        transition: "opacity 0.3s, background-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#111111";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <button
        onClick={onToggle}
        aria-label={done ? "Marcar pendiente" : "Completar tarea"}
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: `1.5px solid ${done ? "var(--accent-color)" : "#333"}`,
          background: done ? "var(--accent-color)" : "transparent",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
          marginTop: 3,
        }}
        onMouseEnter={(e) => {
          if (!done) e.currentTarget.style.borderColor = "var(--accent-color)";
        }}
        onMouseLeave={(e) => {
          if (!done) e.currentTarget.style.borderColor = "#333";
        }}
      >
        {done && <IconCheck size={11} stroke={3} color="white" />}
      </button>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left bg-transparent"
          style={{
            fontSize: 14,
            color: "#d0d0d0",
            textDecoration: done ? "line-through" : "none",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            whiteSpace: "normal",
            cursor: onOpen ? "pointer" : "default",
            padding: 0,
            border: "none",
            display: "block",
          }}
        >
          {task.title}
        </button>
        {(projectName || assigneeName) && (
          <div
            className="flex items-center gap-3 mt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
            style={{ cursor: onOpen ? "pointer" : "default" }}
          >
            {projectName && (
              <span
                className="inline-flex items-center gap-1"
                style={{ fontSize: 11, color: "var(--text-tertiary)" }}
              >
                <IconFolder size={11} stroke={1.5} style={{ color: "var(--text-tertiary)" }} />
                <span className="truncate">{projectName}</span>
              </span>
            )}
            {assigneeName && (
              <span
                className="inline-flex items-center gap-1"
                style={{ fontSize: 11, color: "var(--text-tertiary)" }}
              >
                <IconUser size={11} stroke={1.5} style={{ color: "var(--text-tertiary)" }} />
                <span className="truncate">{assigneeName}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {done && (
        <span
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginTop: 2,
          }}
        >
          Completada
        </span>
      )}
      {!done && (
        <StatusBadge status={task.status} />
      )}
      {high && !done && (
        <span
          style={{
            fontSize: 11,
            background: "rgba(220,38,38,0.12)",
            color: "#f87171",
            borderRadius: 100,
            padding: "2px 10px",
            marginTop: 2,
          }}
        >
          Alta
        </span>
      )}
      {overdue && !done && !high && (
        <span
          style={{
            fontSize: 11,
            background: "rgba(220,38,38,0.12)",
            color: "#f87171",
            borderRadius: 100,
            padding: "2px 10px",
            marginTop: 2,
          }}
        >
          Atrasada
        </span>
      )}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "listo"
      ? { label: "Listo", bg: "rgba(74,222,128,0.12)", color: "#4ade80" }
      : status === "en_curso"
        ? { label: "En Curso", bg: "rgba(99,102,241,0.15)", color: "#818cf8" }
        : { label: "Borrador", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
  return (
    <span
      style={{
        fontSize: 11,
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 100,
        padding: "2px 10px",
        marginTop: 2,
      }}
    >
      {cfg.label}
    </span>
  );
}

function ReminderPill({ reminder, onClick, onComplete }: { reminder: Reminder; onClick?: () => void; onComplete?: () => void }) {
  const time = formatTimeInTimeZone(reminder.datetime, detectUserTimeZone());
  const overdue = new Date(reminder.datetime).getTime() < Date.now();
  return (
    <div
      className="flex items-center gap-2 w-full"
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${overdue ? "rgba(248,113,113,0.35)" : "var(--border)"}`,
        borderRadius: "var(--radius-pill)",
        padding: "6px 14px",
        fontSize: 12,
      }}
    >
      {onComplete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          aria-label="Completar recordatorio"
          style={{
            width: 18, height: 18, borderRadius: "50%",
            border: `1.5px solid ${overdue ? "#f87171" : "var(--accent-color)"}`,
            background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, padding: 0, cursor: "pointer",
          }}
          className="hover:scale-110 transition-transform"
        />
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 flex-1 min-w-0 text-left bg-transparent border-0 p-0"
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        <IconBell
          size={12}
          stroke={1.75}
          style={{ color: overdue ? "#f87171" : "var(--accent-color)", flexShrink: 0 }}
        />
        <span
          className="flex-1 truncate"
          style={{ color: overdue ? "#f87171" : "var(--text-primary)", fontSize: 12 }}
        >
          {reminder.title}
        </span>
        {overdue && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#f87171",
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 999,
              padding: "1px 8px",
            }}
          >
            Vencido
          </span>
        )}
        <span
          style={{
            color: overdue ? "#f87171" : "var(--text-tertiary)",
            fontVariantNumeric: "tabular-nums",
            fontSize: 12,
          }}
        >
          {time}
        </span>
      </button>
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

function BriefCompact({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .filter(Boolean);
  const headline = lines[0] ?? "";
  const context = lines.slice(1).join(" ").trim();

  useEffect(() => {
    if (!contentRef.current || !context) return;
    const el = contentRef.current;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const savedMaxHeight = el.style.maxHeight;
    const savedOverflow = el.style.overflow;
    el.style.maxHeight = "none";
    el.style.overflow = "visible";
    const fullHeight = el.scrollHeight;
    el.style.maxHeight = savedMaxHeight;
    el.style.overflow = savedOverflow;
    setNeedsClamp(fullHeight > lineHeight * 3 + 1);
  }, [context]);

  return (
    <div>
      <div
        style={{
          fontSize: 15,
          color: "#f2f2f2",
          fontWeight: 600,
          lineHeight: 1.35,
          letterSpacing: "-0.01em",
        }}
      >
        {headline}
      </div>
      {context && (
        <>
          <div
            ref={contentRef}
            style={{
              fontSize: 13,
              color: "#999",
              marginTop: 6,
              lineHeight: 1.5,
              maxHeight: needsClamp ? (expanded ? "200em" : "4.5em") : undefined,
              overflow: needsClamp && !expanded ? "hidden" : undefined,
              transition: needsClamp ? "max-height 0.35s ease" : undefined,
            }}
          >
            {context}
          </div>
          {needsClamp && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                fontSize: 12,
                color: "#a78bfa",
                background: "transparent",
                border: "none",
                padding: "4px 0",
                marginTop: 4,
                cursor: "pointer",
                display: "block",
                marginLeft: "auto",
              }}
              className="hover:opacity-80 transition-opacity"
            >
              {expanded ? "Ver menos" : "Ver más"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ahora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `en ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `en ${h}h ${m}m` : `en ${h}h`;
  const d = Math.floor(h / 24);
  return `en ${d}d`;
}

function AttentionMiniCard({
  to, icon, label, valueNode, hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  valueNode: React.ReactNode;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        background: "#161628",
        border: "1px solid #1e2035",
        borderRadius: 12,
        padding: "12px 14px",
        textDecoration: "none",
        transition: "transform 0.15s, border-color 0.15s",
      }}
      className="hover:scale-[1.01]"
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        {icon}
        <span
          style={{
            fontSize: 9,
            color: "#8a8aa0",
            letterSpacing: "0.1em",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {valueNode}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            marginTop: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hint}
        </div>
      )}
    </Link>
  );
}

