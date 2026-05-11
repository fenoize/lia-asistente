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

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [profileRes, tasksRes, meetingsRes, remindersRes, contactsRes, projectsRes, relationsRes] = await Promise.all([
    supabase.from("profiles").select("name, role, goals, timezone, assistant_name, assistant_gender").maybeSingle(),
    supabase.from("tasks")
      .select("title, priority, due_date, status, assigned_to, project_id")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(80),
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
    supabase.from("contacts")
      .select("id, name, type, relationship_type, status, last_activity_at, company, context, birthday, custom_fields")
      .limit(50),
    supabase.from("projects")
      .select("id, name, status, due_date, client_id"),
    supabase.from("contact_relations")
      .select("contact_a, contact_b, relation_label, shared_context"),
  ]);

  const profile = profileRes.data ?? {};
  const allTasks = tasksRes.data ?? [];
  const tasks = allTasks.filter((t: any) => t.status !== "done");
  const meetings = meetingsRes.data ?? [];
  const reminders = remindersRes.data ?? [];
  const contacts = contactsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const relations = relationsRes.data ?? [];

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

  const gender = ((profile as any).assistant_gender === "masculine" ? "masculine" : "feminine") as "feminine" | "masculine";

  return {
    name: (profile as any).name ?? "amigo",
    role: (profile as any).role ?? "(sin definir)",
    goals: (profile as any).goals ?? "(sin definir)",
    timezone: (profile as any).timezone ?? TZ,
    assistantName: (profile as any).assistant_name ?? "Lia",
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
    activeClients: contacts.filter((c: any) => c.type === "client" && c.status === "active").length,
    overdueProjects: bullets(
      projects
        .filter(
          (p: any) =>
            p.status === "active" && p.due_date && new Date(p.due_date) < startOfToday,
        )
        .map((p: any) => {
          const client = contacts.find((c: any) => c.id === p.client_id);
          return `- ${p.name}${client ? ` (${client.name})` : ""} — vencía ${fmtDate(p.due_date)}`;
        }),
      "(ninguno)",
    ),
    unassignedTasks: bullets(
      tasks.filter((t: any) => !t.assigned_to).map(fmtTask).slice(0, 15),
      "(ninguna)",
    ),
    inactiveClients: bullets(
      contacts
        .filter(
          (c: any) =>
            c.type === "client" &&
            c.status === "active" &&
            (!c.last_activity_at || new Date(c.last_activity_at) < fourteenDaysAgo),
        )
        .map((c: any) => `- ${c.name}${c.company ? ` (${c.company})` : ""}`),
      "(ninguno)",
    ),
    contactMemory: bullets(
      contacts.map((c: any) => {
        const rt = c.relationship_type ?? c.type ?? "contacto";
        const ctx = c.context ? c.context.replace(/\s+/g, " ").trim().slice(0, 240) : "sin contexto";
        const bday = c.birthday ? ` · cumpleaños ${c.birthday}` : "";
        const cf = c.custom_fields && typeof c.custom_fields === "object"
          ? Object.entries(c.custom_fields)
              .filter(([k, v]) => k && v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          : "";
        return `- ${c.name} (${rt}): ${ctx}${bday}${cf ? ` · ${cf}` : ""}`;
      }),
      "(sin contactos guardados)",
    ),
    contactLinks: bullets(
      relations.map((r: any) => {
        const a = contacts.find((c: any) => c.id === r.contact_a)?.name ?? "?";
        const b = contacts.find((c: any) => c.id === r.contact_b)?.name ?? "?";
        const sc = r.shared_context ? ` Contexto: ${r.shared_context}` : "";
        return `- ${a} y ${b} son ${r.relation_label}.${sc}`;
      }),
      "(sin vínculos)",
    ),
  };
}
