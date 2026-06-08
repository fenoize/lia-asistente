import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlfredContext } from "./prompts";
import { USER_TZ, formatDateTimeInTimeZone, formatTimeInTimeZone, getDayRangeUTC } from "@/lib/timezone";

const TZ = USER_TZ;

function fmtDate(iso: string, timezone: string): string {
  return formatDateTimeInTimeZone(iso, timezone);
}

function fmtTime(iso: string, timezone: string): string {
  return formatTimeInTimeZone(iso, timezone);
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
  requestedTimezone?: string,
): Promise<AlfredContext> {
  const now = new Date();
  const timezone = requestedTimezone || TZ;
  const todayRange = getDayRangeUTC(timezone, 0, now);
  const tomorrowRange = getDayRangeUTC(timezone, 1, now);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const [profileRes, tasksRes, meetingsRes, remindersRes, contactsRes, projectsRes, relationsRes] = await Promise.all([
    supabase.from("profiles").select("name, role, goals, timezone, assistant_name, assistant_gender").maybeSingle(),
    supabase.from("tasks")
      .select("id, title, priority, start_date, due_date, status, assigned_to, project_id")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(80),
    supabase.from("meetings")
      .select("title, datetime, duration_minutes, preparation_needed")
      .gte("datetime", todayRange.startIso)
      .lt("datetime", tomorrowRange.endExclusiveIso)
      .order("datetime", { ascending: true }),
    supabase.from("reminders")
      .select("title, datetime")
      .eq("done", false)
      .gte("datetime", todayRange.startIso)
      .lt("datetime", todayRange.endExclusiveIso)
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
  const tasks = allTasks.filter((t: any) => t.status !== "listo");
  const meetings = meetingsRes.data ?? [];
  const reminders = remindersRes.data ?? [];
  const contacts = contactsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const relations = relationsRes.data ?? [];
  const todayStart = new Date(todayRange.startIso);
  const tomorrowStart = new Date(tomorrowRange.startIso);

  const overdue = tasks.filter(
    (t: any) => t.due_date && new Date(t.due_date) < todayStart,
  );
  const pending = tasks.filter(
    (t: any) => !overdue.includes(t),
  );
  const dueToday = tasks.filter((t: any) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    return d >= todayStart && d < tomorrowStart;
  });
  const urgentExtra = tasks.filter(
    (t: any) => t.priority === "urgent" && !overdue.includes(t) && !dueToday.includes(t),
  );
  const briefTasks = [...dueToday, ...overdue, ...urgentExtra];

  const briefClientIds = new Set<string>();
  for (const t of briefTasks) {
    const proj = projects.find((p: any) => p.id === (t as any).project_id);
    if (proj?.client_id) briefClientIds.add(proj.client_id);
  }
  const briefClientNames = Array.from(briefClientIds)
    .map((id) => contacts.find((c: any) => c.id === id)?.name)
    .filter(Boolean) as string[];

  const fmtTask = (t: any) =>
    `- [${PRIORITY_LABEL[t.priority] ?? "media"}] ${t.title}${
      t.due_date ? ` (vence: ${fmtDate(t.due_date, timezone)})` : ""
    }`;

  const fmtMeeting = (m: any) =>
    `- [${fmtTime(m.datetime, timezone)}] ${m.title} (${m.duration_minutes ?? 60}min)${
      m.preparation_needed ? " — requiere preparación" : ""
    }`;

  const todayMeetings = meetings.filter(
    (m: any) => new Date(m.datetime).toISOString() < tomorrowRange.startIso,
  );
  const tomorrowMeetings = meetings.filter(
    (m: any) => new Date(m.datetime).toISOString() >= tomorrowRange.startIso,
  );

  const gender = ((profile as any).assistant_gender === "masculine" ? "masculine" : "feminine") as "feminine" | "masculine";

  return {
    name: (profile as any).name ?? "amigo",
    role: (profile as any).role ?? "(sin definir)",
    goals: (profile as any).goals ?? "(sin definir)",
    timezone,
    assistantName: (profile as any).assistant_name ?? "Lia",
    assistantGender: gender,
    currentTime: new Intl.DateTimeFormat("es-CL", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(now),
    pendingTasks: bullets(pending.map(fmtTask), "(ninguna)"),
    overdueTasks: bullets(overdue.map(fmtTask), "(ninguna)"),
    todayMeetings: bullets(todayMeetings.map(fmtMeeting), "(ninguna)"),
    tomorrowMeetings: bullets(tomorrowMeetings.map(fmtMeeting), "(ninguna)"),
    briefTaskCount: briefTasks.length,
    briefTasksList: bullets(briefTasks.map(fmtTask), "(ninguna)"),
    briefClientCount: briefClientNames.length,
    briefClientNames: briefClientNames.join(", "),
    todayMeetingCount: todayMeetings.length,
    activeReminderCount: reminders.length,
    activeReminders: bullets(
      reminders.map((r: any) => `- ${r.title} (${fmtDate(r.datetime, timezone)})`),
      "(ninguno)",
    ),
    activeClients: contacts.filter((c: any) => c.type === "client" && c.status === "active").length,
    overdueProjects: bullets(
      projects
        .filter(
          (p: any) =>
            p.status === "active" && p.due_date && new Date(p.due_date) < todayStart,
        )
        .map((p: any) => {
          const client = contacts.find((c: any) => c.id === p.client_id);
          return `- ${p.name}${client ? ` (${client.name})` : ""} — vencía ${fmtDate(p.due_date, timezone)}`;
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
    projectsCatalog: bullets(
      projects.map((p: any) => {
        const client = contacts.find((c: any) => c.id === p.client_id);
        return `- ${p.name}${client ? ` (cliente: ${client.name})` : ""}${p.status ? ` [${p.status}]` : ""} [id: ${p.id}]`;
      }),
      "(sin proyectos)",
    ),
    openTasksCatalog: bullets(
      tasks.map((t: any) => {
        const proj = projects.find((p: any) => p.id === t.project_id);
        return `- "${t.title}" [id: ${t.id}]${t.due_date ? ` · vence ${fmtDate(t.due_date, timezone)}` : " · sin fecha"} · prioridad ${PRIORITY_LABEL[t.priority] ?? "media"}${proj ? ` · proyecto ${proj.name}` : ""}`;
      }),
      "(sin tareas abiertas)",
    ),
  };
}
