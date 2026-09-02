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

export function slotMatchesDuration(startHour: number, endHour: number, durationMin: number): boolean {
  return Math.abs(endHour - endHourFromDuration(startHour, durationMin)) < 1e-9;
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