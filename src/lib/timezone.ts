export const USER_TZ = "America/Santiago";

type DateInputParts = {
  date: string;
  time: string;
};

type NormalizeDatetimeOptions = {
  treatZuluAsLocal?: boolean;
};

export function detectUserTimeZone(fallback: string = USER_TZ): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
      return timezone;
    }
  } catch {
    // no-op
  }
  return fallback;
}

function zonedParts(value: Date | string, timezone: string = USER_TZ) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function shiftDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function formatInTimeZone(
  value: Date | string,
  options: Intl.DateTimeFormatOptions,
  timezone: string = USER_TZ,
  locale = "es-CL",
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date);
}

export function formatTimeInTimeZone(value: Date | string, timezone: string = USER_TZ): string {
  return formatInTimeZone(value, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }, timezone);
}

export function formatDateTimeInTimeZone(value: Date | string, timezone: string = USER_TZ): string {
  return formatInTimeZone(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }, timezone);
}

export function currentDateInTimeZone(timezone: string = USER_TZ, at: Date = new Date()): string {
  const { year, month, day } = zonedParts(at, timezone);
  return `${year}-${month}-${day}`;
}

export function toDateInputs(iso: string | null, timezone: string = USER_TZ): DateInputParts {
  const { year, month, day, hour, minute } = zonedParts(iso ?? new Date(), timezone);
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

export function toDateTimeLocalInput(iso: string, timezone: string = USER_TZ): string {
  const { date, time } = toDateInputs(iso, timezone);
  return `${date}T${time}`;
}

export function localInputsToUTCISOString(
  date: string,
  time: string,
  timezone: string = USER_TZ,
): string {
  return new Date(localInputsToISO(date, time, timezone)).toISOString();
}

export function localDateTimeToUTCISOString(
  localDateTime: string,
  timezone: string = USER_TZ,
): string {
  const match = localDateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return new Date(localDateTime).toISOString();
  return localInputsToUTCISOString(match[1], match[2], timezone);
}

export function getDayRangeUTC(
  timezone: string = USER_TZ,
  dayOffset = 0,
  baseDate: Date = new Date(),
): { date: string; startIso: string; endExclusiveIso: string } {
  const date = shiftDateString(currentDateInTimeZone(timezone, baseDate), dayOffset);
  const nextDate = shiftDateString(date, 1);
  return {
    date,
    startIso: localInputsToUTCISOString(date, "00:00", timezone),
    endExclusiveIso: localInputsToUTCISOString(nextDate, "00:00", timezone),
  };
}

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
  options: NormalizeDatetimeOptions = {},
): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (/[+-]\d{2}:?\d{2}$/.test(trimmed)) return trimmed;
  if (/Z$/i.test(trimmed)) {
    if (!options.treatZuluAsLocal) return trimmed;
    const withoutZulu = trimmed.replace(/Z$/i, "");
    const zuluMatch = withoutZulu.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (!zuluMatch) return trimmed;
    return localInputsToISO(zuluMatch[1], zuluMatch[2], timezone);
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!match) return trimmed;
  return localInputsToISO(match[1], match[2], timezone);
}

export function toUTCISOString(
  iso: string | null | undefined,
  timezone: string = USER_TZ,
  options: NormalizeDatetimeOptions = {},
): string | null {
  const normalized = normalizeDatetime(iso, timezone, options);
  return normalized ? new Date(normalized).toISOString() : null;
}
