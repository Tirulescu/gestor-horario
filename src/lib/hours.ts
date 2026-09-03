import { DAYS_LONG } from "./validate";

// Formato de horas XX:XX (soporta :30). "16" -> "16:00", "16.5" -> "16:30"
export function fmtHour(h: number | string): string {
  const n = Number(h);
  if (!Number.isFinite(n)) return String(h);
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function fmtRange(a: number | string, b: number | string): string {
  return `${fmtHour(a)}–${fmtHour(b)}`;
}

/** Ej. Lunes (15:00–20:00) */
export function fmtDayRange(day: number, start: number | string, end: number | string): string {
  const name = DAYS_LONG[day] ?? `Día ${day}`;
  return `${name} (${fmtRange(start, end)})`;
}

/** Ej. 90 → "1 h 30 min", 60 → "1 h", 45 → "45 min" */
export function fmtDurationMin(durationMin: number): string {
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Hora de fin exacta: inicio + duración en minutos (ej. 10:00 + 90 min → 11:30). */
export function endHourFromDuration(startHour: number, durationMin: number): number {
  return (Math.round(startHour * 60) + durationMin) / 60;
}

/** Duración de clase según asignatura colectiva o inscripción individual. */
export function resolveMemberDurationMin(
  subject: { defaultDurationMin: number; isCollective?: boolean },
  member?: { durationMin: number | null } | null,
): number {
  if (subject.isCollective) return subject.defaultDurationMin;
  return member?.durationMin ?? subject.defaultDurationMin;
}

/** Duraciones distintas definidas en una asignatura (defecto, por curso y por alumno). */
export function collectSubjectDurationOptions(
  subject: { defaultDurationMin: number; isCollective?: boolean },
  members?: { durationMin: number | null }[] | null,
  gradeDurations?: { durationMin: number }[] | null,
): number[] {
  if (subject.isCollective) return [subject.defaultDurationMin];
  const durations = new Set<number>([subject.defaultDurationMin]);
  for (const m of members ?? []) {
    if (m.durationMin != null) durations.add(m.durationMin);
  }
  for (const g of gradeDurations ?? []) {
    durations.add(g.durationMin);
  }
  return [...durations].sort((a, b) => a - b);
}

/** Etiqueta compacta para listas/selects (ej. "60 min" o "30 · 60 min"). */
export function fmtSubjectDurationOptions(
  subject: { defaultDurationMin: number; isCollective?: boolean },
  members?: { durationMin: number | null }[] | null,
  gradeDurations?: { durationMin: number }[] | null,
): string {
  const opts = collectSubjectDurationOptions(subject, members, gradeDurations);
  if (opts.length === 1) return `${opts[0]} min`;
  return opts.map((d) => `${d} min`).join(" · ");
}

/** Duración en minutos de una franja (inicio–fin). */
export function slotDurationMin(startHour: number, endHour: number): number {
  return Math.round((endHour - startHour) * 60);
}

/** Paso mínimo de duración de asignatura (media hora). */
export const DURATION_STEP_MIN = 30;
/** Duración mínima de asignatura. */
export const MIN_DURATION_MIN = 30;

/** True si la duración es múltiplo de media hora (≥ 30 min). */
export function isValidDurationMin(durationMin: number): boolean {
  return (
    Number.isInteger(durationMin) &&
    durationMin >= MIN_DURATION_MIN &&
    durationMin % DURATION_STEP_MIN === 0
  );
}

export function durationMinError(durationMin: number): string | null {
  if (!Number.isFinite(durationMin) || !Number.isInteger(durationMin)) {
    return "La duración debe ser un número entero de minutos";
  }
  if (durationMin < MIN_DURATION_MIN) {
    return `La duración mínima es ${MIN_DURATION_MIN} min`;
  }
  if (durationMin % DURATION_STEP_MIN !== 0) {
    return `La duración debe ser múltiplo de ${DURATION_STEP_MIN} min (p. ej. 1 h, 1 h 30 min)`;
  }
  return null;
}

/**
 * Partes válidas para cubrir `maxDurationMin` (p. ej. 60 → 30, 60).
 * Pasos de 30 min; la duración exacta se incluye si es múltiplo del paso.
 */
export function durationPartOptions(maxDurationMin: number, stepMin = DURATION_STEP_MIN): number[] {
  if (!(maxDurationMin >= 1)) return [];
  const opts: number[] = [];
  for (let d = stepMin; d <= maxDurationMin; d += stepMin) opts.push(d);
  return opts;
}

/** La franja dura entre 1 min y el máximo de la asignatura (permite dividir la clase). */
export function slotFitsMaxDuration(startHour: number, endHour: number, maxDurationMin: number): boolean {
  const d = slotDurationMin(startHour, endHour);
  return d >= 1 && d <= maxDurationMin;
}

/** Duración de cada media hora al dividir una asignatura. */
export const SESSION_PART_MIN = DURATION_STEP_MIN;

/** Máximo de partes de 30 min posibles para una duración total. */
export function maxSessionParts(durationMin: number): number {
  if (!isValidDurationMin(durationMin)) return 1;
  return durationMin / SESSION_PART_MIN;
}

/**
 * Opciones del selector (≥2) al dividir: solo valores que cubren toda la duración
 * en medias horas (p. ej. 90 → [3], 120 → [4]).
 */
export function sessionPartsOptions(durationMin: number): number[] {
  const max = maxSessionParts(durationMin);
  if (max < 2) return [];
  return [max];
}

/** True si `sessionParts` encaja con la duración (1 = sin dividir; N = N×30 = total). */
export function sessionPartsFitDuration(durationMin: number, sessionParts: number): boolean {
  const parts = Math.max(1, Math.floor(sessionParts) || 1);
  if (parts <= 1) return true;
  if (!isValidDurationMin(durationMin)) return false;
  return parts * SESSION_PART_MIN === durationMin;
}

/** True si dos franjas del mismo día se tocan (contiguas). */
export function slotsAreAdjacent(
  a: { day: number; start: number; end: number },
  b: { day: number; start: number; end: number },
): boolean {
  if (a.day !== b.day) return false;
  return Math.abs(a.end - b.start) < 1e-9 || Math.abs(b.end - a.start) < 1e-9;
}

export function durationFitsInInterval(
  startHour: number,
  durationMin: number,
  interval: { start: number; end: number },
): boolean {
  const end = endHourFromDuration(startHour, durationMin);
  return startHour >= interval.start - 1e-9 && end <= interval.end + 1e-9;
}

/** Genera inicios candidatos en pasos de 30 min donde cabe la duración completa. */
export function* slotStartsForDuration(
  interval: { start: number; end: number },
  durationMin: number,
): Generator<number> {
  for (let st = interval.start; durationFitsInInterval(st, durationMin, interval); st += 0.5) {
    yield Math.round(st * 2) / 2;
  }
}

/** Rango visible del calendario semanal (horas enteras). */
export const SCHEDULE_DAY_START = 7;
export const SCHEDULE_DAY_END = 23;
/** Fin inclusivo de selectores (medianoche). */
export const SCHEDULE_SELECT_END = 24;

/** Opciones de horas para selects: 00:00 .. 23:30 en pasos de 30 min. */
export function hourOptions(from = 0, to = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = from; h <= to; h++) {
    for (const m of [0, 30]) {
      if (h === to && m === 30) break;
      const v = h + m / 60;
      out.push({ value: String(v), label: fmtHour(v) });
    }
  }
  return out;
}

/** Inicios alineados al calendario (7:00–23:00). */
export const SCHEDULE_HOURS_START = hourOptions(SCHEDULE_DAY_START, SCHEDULE_DAY_END);
/** Fines alineados al calendario (7:30–24:00). */
export const SCHEDULE_HOURS_END = hourOptions(SCHEDULE_DAY_START, SCHEDULE_SELECT_END).filter(
  (o) => Number(o.value) > SCHEDULE_DAY_START,
);

/** Conserva `end` solo si es posterior a `start`; si no, cadena vacía (Select sin valor huérfano). */
export function endIfAfterStart(start: string, end: string): string {
  return start !== "" && end !== "" && Number(end) > Number(start) ? end : "";
}