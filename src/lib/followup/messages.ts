// Message generation for the Follow-Up Engine.
// Multiple natural variants per intent, built dynamically from task context.
// Deterministic variant pick (based on task id + attempt) so the same task
// never repeats the same phrasing twice in a row.

import type { Evaluation, FollowUpTask, NotificationIntent } from "./types";

type Vars = {
  /** Human reference to the task, project-aware. */
  subject: string;
  title: string;
  project: string | null;
  days: number;
  weeks: number;
};

type Variant = (v: Vars) => string;

const VARIANTS: Record<NotificationIntent, Variant[]> = {
  anticipate: [
    (v) => `Hey! ${cap(v.subject)} se acerca. ¿Quieres que la avancemos?`,
    (v) => `Tenemos algo acercándose: ${v.subject}. ¿La ponemos en tu foco de hoy?`,
    (v) => `${cap(v.subject)} entra en carrera esta semana. ¿La empezamos antes?`,
    (v) => `Quedan ${v.days} días para ${v.subject}. ¿La dejamos encaminada?`,
    (v) => `Todavía hay margen con ${v.subject}, pero mejor no dejarla al final. ¿La avanzamos?`,
  ],
  prepare: [
    (v) => `Quedan ${v.days === 1 ? "menos de 2 días" : `${v.days} días`} para ${v.subject}. ¿Qué falta para cerrarla?`,
    (v) => `${cap(v.subject)} vence pronto. ¿Necesitas algo para poder terminarla?`,
    (v) => `Se viene ${v.subject}. ¿La dejamos lista hoy o mañana?`,
    (v) => `Ojo con ${v.subject}: entra en zona de atención. ¿Qué te falta?`,
    (v) => `${cap(v.subject)} está a la vuelta de la esquina. ¿Le damos un empujón ahora?`,
  ],
  activate: [
    (v) => `Hey! Hoy tenemos pendiente ${v.subject}. ¿La hacemos ahora?`,
    (v) => `${cap(v.subject)} está para hoy. ¿Quieres que la pongamos en marcha?`,
    (v) => `Hoy vence ${v.subject}. ¿La tomamos ahora o la movemos?`,
    (v) => `${cap(v.subject)} es lo del día. ¿Partimos por ahí?`,
    (v) => `Última llamada para ${v.subject}: vence hoy. ¿La cerramos?`,
  ],
  resolve: [
    (v) => `${cap(v.subject)} quedó atrasada. ¿La retomamos?`,
    (v) => `${cap(v.subject)} está atrasada. ¿La resolvemos hoy?`,
    (v) => `Se nos pasó la fecha de ${v.subject}. ¿La movemos a hoy o la cerramos ahora?`,
    (v) => `${cap(v.subject)} lleva ${v.days} ${v.days === 1 ? "día" : "días"} atrasada. ¿La ponemos al día?`,
    (v) => `Esto lleva pendiente más tiempo del esperado. ¿Qué está bloqueando ${v.subject}?`,
  ],
  schedule: [
    (v) => `¿Cuándo hacemos ${v.subject}?`,
    (v) => `Tenemos pendiente ${v.subject}, pero todavía no tiene fecha. ¿Cuándo la hacemos?`,
    (v) => `¿Quieres que agendemos ${v.subject} para esta semana?`,
    (v) => `${cap(v.subject)} sigue sin fecha. ¿Le ponemos una?`,
    (v) => `¿Y si le ponemos fecha a ${v.subject}?`,
  ],
  clarify: [
    (v) => `${cap(v.subject)} sigue pendiente. ¿Qué falta para poder hacerla?`,
    (v) => `No veo movimiento en ${v.subject}. ¿Qué te está frenando?`,
    (v) => `${cap(v.subject)} lleva ${v.days} días sin avanzar. ¿Depende de alguien más?`,
    (v) => `¿${cap(v.subject)} sigue teniendo sentido o cambió algo?`,
    (v) => `Antes de insistir con ${v.subject}: ¿qué necesitas para destrabarla?`,
  ],
  unblock: [
    (v) => `${cap(v.subject)} sigue pendiente. ¿Está bloqueada o avanzamos con lo que hay?`,
    (v) => `Marcaste ${v.subject} como bloqueada. ¿Qué necesitas para destrabarla?`,
    (v) => `¿Sigue bloqueada ${v.subject}? Si depende de alguien, podemos hacer seguimiento.`,
    (v) => `${cap(v.subject)} está detenida. ¿Avanzamos con una versión parcial?`,
    (v) => `¿Destrabamos ${v.subject} hoy o la dejamos en pausa con fecha de revisión?`,
  ],
  discard: [
    (v) =>
      `${cap(v.subject)} lleva ${v.weeks >= 1 ? `${v.weeks} ${v.weeks === 1 ? "semana" : "semanas"}` : `${v.days} días`} dando vueltas. ¿La hacemos, la agendamos o la descartamos?`,
    (v) => `¿Qué hacemos con ${v.subject}: esta semana, más adelante o la descartamos?`,
    (v) => `${cap(v.subject)} lleva bastante tiempo pendiente y sin fecha. ¿Todavía vale la pena?`,
    (v) => `Sinceramente, ${v.subject} lleva demasiado tiempo ahí. ¿La cerramos o la sacamos de la lista?`,
    (v) => `Decidamos algo con ${v.subject}: fecha concreta o la descartamos.`,
  ],
};

const TITLE_BY_INTENT: Record<NotificationIntent, string> = {
  anticipate: "Se viene algo",
  prepare: "Prepárate",
  activate: "Para hoy",
  resolve: "Tarea atrasada",
  schedule: "Sin fecha",
  clarify: "¿Qué falta?",
  unblock: "Tarea bloqueada",
  discard: "Decisión pendiente",
};

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildSubject(task: FollowUpTask, projectName: string | null): string {
  const title = (task.title ?? "").trim();
  if (!projectName) return `la tarea "${title}"`;
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes(projectName.toLowerCase())) return `"${title}"`;
  return `"${title}" (${projectName})`;
}

export function generateTaskFollowUp(
  task: FollowUpTask,
  evaluation: Evaluation,
  options: { projectName?: string | null; attempt?: number; now?: Date } = {},
): { title: string; message: string } {
  const projectName = options.projectName ?? task.project ?? null;
  const now = options.now ?? new Date();
  const attempt = options.attempt ?? 0;

  const reference = task.due_date
    ? new Date(task.due_date)
    : new Date(task.created_at ?? now.toISOString());
  const days = Math.max(1, Math.round(Math.abs(now.getTime() - reference.getTime()) / 86_400_000));

  const vars: Vars = {
    subject: buildSubject(task, projectName),
    title: task.title,
    project: projectName,
    days,
    weeks: Math.floor(days / 7),
  };

  const pool = VARIANTS[evaluation.notification_intent];
  const seed = hash(task.id) + attempt;
  const variant = pool[seed % pool.length]!;

  return { title: TITLE_BY_INTENT[evaluation.notification_intent], message: variant(vars) };
}

/** Builds one grouped message for several tasks that need attention at once. */
export function generateGroupedFollowUp(
  items: { task: FollowUpTask; projectName: string | null; state: string }[],
): { title: string; message: string } {
  const named = items.slice(0, 3).map((i) => buildSubject(i.task, i.projectName));
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} y ${named[named.length - 1]}`;
  const rest = items.length - named.length;
  const tail = rest > 0 ? ` (y ${rest} más)` : "";
  return {
    title: "Varias cosas necesitan atención",
    message: `Tienes varias cosas que necesitan atención hoy: ${list}${tail}. ¿Quieres que prioricemos las 2 más importantes?`,
  };
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}
