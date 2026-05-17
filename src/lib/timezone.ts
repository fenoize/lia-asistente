// Zona horaria fija del usuario. Si en el futuro queremos leerla del profile,
// reemplazar este export por un hook/contexto.
export const USER_TZ = "America/Santiago";

/**
 * Offset actual de una zona horaria en formato "+HH:MM" / "-HH:MM",
 * calculado en `at` (default: ahora). Maneja DST correctamente.
 */
export function tzOffset(timezone: string = USER_TZ, at: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  );
  const diffMin = Math.round((asUTC - at.getTime()) / 60000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(diffMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/**
 * Combina date (YYYY-MM-DD) + time (HH:MM) interpretándolos como hora local
 * de `timezone` y devuelve un ISO con offset explícito (apto para timestamptz).
 */
export function localInputsToISO(
  date: string,
  time: string,
  timezone: string = USER_TZ,
): string {
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? time : "09:00";
  // Pivot date para resolver el offset (con DST) en el día indicado.
  const pivot = new Date(`${date}T${safeTime}:00Z`);
  const off = tzOffset(timezone, pivot);
  return `${date}T${safeTime}:00${off}`;
}

/**
 * Toma horas/minutos en hora local del usuario y un offset de días,
 * y devuelve un ISO con el offset de `timezone`.
 */
export function nextDateAtLocal(
  hour: number,
  minute: number,
  daysAhead = 0,
  timezone: string = USER_TZ,
): string {
  // Fecha "hoy" según `timezone`.
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).map(p => [p.type, p.value]),
  );
  const base = new Date(Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
  ));
  base.setUTCDate(base.getUTCDate() + daysAhead);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return localInputsToISO(`${y}-${m}-${d}`, `${hh}:${mm}`, timezone);
}

/**
 * Si un ISO viene sin offset ni "Z", lo interpretamos como hora local
 * de `timezone` y agregamos el offset correspondiente. Si ya trae info
 * de zona horaria, se devuelve igual.
 */
export function normalizeDatetime(
  iso: string | null | undefined,
  timezone: string = USER_TZ,
): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  // Ya tiene Z o ±HH:MM al final.
  if (/Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!match) return trimmed;
  return localInputsToISO(match[1], match[2], timezone);
}
