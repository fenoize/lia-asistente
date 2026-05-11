import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlfredContext } from "./prompts";

const TZ = "America/Santiago";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PRIORITY_LABEL: Record<string, string> = {
  high: "alta",
  urgent: "urgente",
  medium: "media",
  low: "baja",
};

function bullets(lines: string[], emptyLabel = "(ninguna)"): string {
  return lines.length ? lines.join("\n") : emptyLabel;
}

export async function buildContext(
  supabase: SupabaseClient,
): Promise<AlfredContext> {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const startOfTomorrow = new Date(endOfToday); startOfTomorrow.setSeconds(startOfTomorrow.getSeconds() + 1);
  const endOfTomorrow = new Date(startOfTomorrow); endOfTomorrow.setHours(23, 59, 59, 999);

  const [profileRes, tasksRes, meetingsRes, remindersRes] = await Promise.all([
    supabase.from("profiles").select("name, role, goals, timezone, assistant_name, assistant_gender").maybeSingle(),
    supabase.from("tasks")
      .select("title, priority, due_date, status")
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(30),
    supabase.from("meetings")
      .select("title, datetime, duration_minutes, preparation_needed")
      .gte("datetime", startOfToday.toISOString())
      .lte("datetime", endOfTomorrow.toISOString())
      .order("datetime", { ascending: true }),
    supabase.from("reminders")
      .select("title, datetime")
      .eq("done", false)
      .gte("datetime", startOfToday.toISOString())
      .order("datetime", { ascending: true })
      .limit(20),
  ]);

  const profile = profileRes.data ?? {};
  const tasks = tasksRes.data ?? [];
  const meetings = meetingsRes.data ?? [];
  const reminders = remindersRes.data ?? [];

  const overdue = tasks.filter(
    (t: any) => t.due_date && new Date(t.due_date) < startOfToday,
  );
  const pending = tasks.filter(
    (t: any) => !overdue.includes(t),
  );

  const fmtTask = (t: any) =>
    `- [${PRIORITY_LABEL[t.priority] ?? "media"}] ${t.title}${
      t.due_date ? ` (vence: ${fmtDate(t.due_date)})` : ""
    }`;

  const fmtMeeting = (m: any) =>
    `- [${fmtTime(m.datetime)}] ${m.title} (${m.duration_minutes ?? 60}min)${
      m.preparation_needed ? " — requiere preparación" : ""
    }`;

  const todayMeetings = meetings.filter(
    (m: any) => new Date(m.datetime) <= endOfToday,
  );
  const tomorrowMeetings = meetings.filter(
    (m: any) => new Date(m.datetime) > endOfToday,
  );

  const gender = ((profile as any).assistant_gender === "feminine" ? "feminine" : "masculine") as "feminine" | "masculine";

  return {
    name: (profile as any).name ?? "amigo",
    role: (profile as any).role ?? "(sin definir)",
    goals: (profile as any).goals ?? "(sin definir)",
    timezone: (profile as any).timezone ?? TZ,
    assistantName: (profile as any).assistant_name ?? "Alfred",
    assistantGender: gender,
    currentTime: now.toLocaleString("es-CL", {
      timeZone: TZ,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }),
    pendingTasks: bullets(pending.map(fmtTask), "(ninguna)"),
    overdueTasks: bullets(overdue.map(fmtTask), "(ninguna)"),
    todayMeetings: bullets(todayMeetings.map(fmtMeeting), "(ninguna)"),
    tomorrowMeetings: bullets(tomorrowMeetings.map(fmtMeeting), "(ninguna)"),
    activeReminders: bullets(
      reminders.map((r: any) => `- ${r.title} (${fmtDate(r.datetime)})`),
      "(ninguno)",
    ),
  };
}
