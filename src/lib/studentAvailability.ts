import {
  durationFitsInInterval,
  durationPartOptions,
  endHourFromDuration,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
  SCHEDULE_SELECT_END,
  slotFitsMaxDuration,
} from "./hours";
import { mergeIntervals } from "./scheduleIntervals";
import { MAX_SCHEDULE_RANGES } from "./validate";
/** Franja horaria semanal: day 0=Lun … 6=Dom, start/end en horas decimales. */
export type TimeRange = { day: number; start: number; end: number; title?: string };

export function normalizeRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SCHEDULE_RANGES)
    .map((b: { day?: unknown; start?: unknown; end?: unknown }) => ({
      day: Number(b.day),
      start: Number(b.start),
      end: Number(b.end),
    }))
    .filter(
      (b) =>
        Number.isFinite(b.day) &&
        Number.isFinite(b.start) &&
        Number.isFinite(b.end) &&
        b.end > b.start &&
        b.day >= 0 &&
        b.day <= 6
    );
}

/** Igual que normalizeRanges, pero conserva un título opcional (bloqueos). */
export function normalizeBlockedRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_SCHEDULE_RANGES)
    .map((b: { day?: unknown; start?: unknown; end?: unknown; title?: unknown }) => {
      const title = typeof b.title === "string" ? b.title.trim() : "";
      return {
        day: Number(b.day),
        start: Number(b.start),
        end: Number(b.end),
        ...(title ? { title } : {}),
      };
    })
    .filter(
      (b) =>
        Number.isFinite(b.day) &&
        Number.isFinite(b.start) &&
        Number.isFinite(b.end) &&
        b.end > b.start &&
        b.day >= 0 &&
        b.day <= 6
    );
}

export function slotWithinAvailable(
  day: number,
  start: number,
  end: number,
  available: TimeRange[]
): boolean {
  if (available.length === 0) return true;
  return available.some((a) => a.day === day && a.start <= start && a.end >= end);
}

export function slotOverlapsBlocked(
  day: number,
  start: number,
  end: number,
  blocked: TimeRange[]
): boolean {
  return blocked.some((b) => b.day === day && b.end > start && b.start < end);
}

function intersect(a: { start: number; end: number }, b: { start: number; end: number }) {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Resta intervalos ocupados de una lista de franjas del mismo día. */
export function subtractBlockedFromDayRanges(
  ranges: { start: number; end: number }[],
  blocked: { start: number; end: number }[],
): { start: number; end: number }[] {
  let out = ranges;
  for (const b of blocked) {
    const next: { start: number; end: number }[] = [];
    for (const r of out) {
      if (b.end <= r.start || b.start >= r.end) {
        next.push(r);
        continue;
      }
      if (b.start > r.start) next.push({ start: r.start, end: b.start });
      if (b.end < r.end) next.push({ start: b.end, end: r.end });
    }
    out = next;
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Fusiona franjas del mismo día que se solapan o tocan. */
export function mergeAdjacentTimeRanges(ranges: TimeRange[]): TimeRange[] {
  const byDay = new Map<number, { start: number; end: number }[]>();
  for (const r of ranges) {
    const list = byDay.get(r.day) ?? [];
    list.push({ start: r.start, end: r.end });
    byDay.set(r.day, list);
  }
  const out: TimeRange[] = [];
  for (const [day, intervals] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    for (const m of mergeIntervals(intervals)) {
      out.push({ day, start: m.start, end: m.end });
    }
  }
  return out;
}

/**
 * Recorta/divide disponibilidad para que no solape con bloqueos.
 * Ej.: disponible 10–14 y bloqueo 12–13 → 10–12 y 13–14.
 */
export function carveAvailabilityAroundBlocked(
  available: TimeRange[],
  blocked: TimeRange[],
): TimeRange[] {
  const avail = normalizeRanges(available);
  const blocks = normalizeRanges(blocked);
  if (blocks.length === 0) return mergeAdjacentTimeRanges(avail);
  const out: TimeRange[] = [];
  for (const a of avail) {
    const dayBlocked = blocks
      .filter((b) => b.day === a.day)
      .map((b) => ({ start: b.start, end: b.end }));
    for (const p of subtractBlockedFromDayRanges([{ start: a.start, end: a.end }], dayBlocked)) {
      out.push({ day: a.day, start: p.start, end: p.end });
    }
  }
  return mergeAdjacentTimeRanges(out);
}

/** Intersección profesor ∩ alumno, restando bloqueos del alumno. */
export function getEffectiveRangesForDay(
  day: number,
  teacherAvails: { dayOfWeek: number; startHour: number; endHour: number }[],
  studentAvailable: TimeRange[],
  studentBlocked: TimeRange[]
): { start: number; end: number }[] {
  let ranges = teacherAvails
    .filter((a) => a.dayOfWeek === day)
    .map((a) => ({ start: a.startHour, end: a.endHour }));

  if (studentAvailable.length > 0) {
    const dayAvail = studentAvailable
      .filter((a) => a.day === day)
      .map((a) => ({ start: a.start, end: a.end }));
    const ix: { start: number; end: number }[] = [];
    for (const t of ranges) {
      for (const s of dayAvail) {
        const hit = intersect(t, s);
        if (hit) ix.push(hit);
      }
    }
    ranges = ix;
  }

  return subtractBlockedFromDayRanges(
    ranges,
    studentBlocked.filter((x) => x.day === day).map((b) => ({ start: b.start, end: b.end })),
  );
}

/** Intersección entre huecos libres del profesor y franjas disponibles del alumno. */
export function freeWithinStudentAvailability(
  currentFree: Record<number, { start: number; end: number }[]>,
  studentAvailable: TimeRange[],
): Record<number, { start: number; end: number }[]> {
  if (studentAvailable.length === 0) return {};

  const byDay = rangesToZones(studentAvailable);
  const result: Record<number, { start: number; end: number }[]> = {};

  for (const dStr of Object.keys(currentFree)) {
    const day = Number(dStr);
    const dayAvail = byDay[day] ?? [];
    if (dayAvail.length === 0) continue;

    const intervals: { start: number; end: number }[] = [];
    for (const f of currentFree[day] ?? []) {
      for (const a of dayAvail) {
        const hit = intersect(f, a);
        if (hit) intervals.push(hit);
      }
    }
    if (intervals.length > 0) {
      result[day] = intervals.sort((x, y) => x.start - y.start);
    }
  }

  return result;
}

export function allowedHourSet(
  ranges: { start: number; end: number }[],
  hourOpts: { value: string; label: string }[],
  kind: "start" | "end",
  selectedStart?: number
): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) {
    for (const o of hourOpts) {
      const v = Number(o.value);
      if (kind === "start") {
        if (v >= r.start && v < r.end) set.add(o.value);
      } else if (v > r.start && v <= r.end && (selectedStart === undefined || v > selectedStart)) {
        set.add(o.value);
      }
    }
  }
  return set;
}

export function validateSlotRequest(params: {
  day: number;
  start: number;
  end: number;
  teacherAvails: { dayOfWeek: number; startHour: number; endHour: number }[];
  studentAvailable: TimeRange[];
  studentBlocked: TimeRange[];
  requiredDurationMin?: number;
}): string | null {
  const { day, start, end, teacherAvails, studentAvailable, studentBlocked, requiredDurationMin } = params;
  if (!(end > start)) return "La hora de fin debe ser posterior a la de inicio";

  if (requiredDurationMin != null && requiredDurationMin > 0 && !slotFitsMaxDuration(start, end, requiredDurationMin)) {
    return `La franja no puede superar ${requiredDurationMin} min (puedes dividirla en varias solicitudes)`;
  }

  const teacherOk = teacherAvails.some(
    (a) => a.dayOfWeek === day && a.startHour <= start && a.endHour >= end
  );
  if (!teacherOk) return "Fuera de la disponibilidad del profesor";

  if (!slotWithinAvailable(day, start, end, studentAvailable)) {
    return "Fuera del horario disponible del alumno";
  }

  if (slotOverlapsBlocked(day, start, end, studentBlocked)) {
    return "Choca con una hora bloqueada del alumno";
  }

  return null;
}

export function rangesToZones(ranges: TimeRange[]): Record<number, { start: number; end: number }[]> {
  const zones: Record<number, { start: number; end: number }[]> = {};
  for (const r of ranges) {
    (zones[r.day] ??= []).push({ start: r.start, end: r.end });
  }
  return zones;
}

/** Sombrea fuera de las franjas disponibles (cuando hay disponibilidad definida). */
export function unavailableOutsideAvailable(
  available: TimeRange[],
  lo = SCHEDULE_DAY_START,
  hi = SCHEDULE_DAY_END,
): Record<number, { start: number; end: number }[]> {
  if (available.length === 0) return {};
  const byDay = rangesToZones(available);
  const result: Record<number, { start: number; end: number }[]> = {};
  for (let day = 0; day < 7; day++) {
    const slots = (byDay[day] ?? []).sort((a, b) => a.start - b.start);
    if (slots.length === 0) {
      result[day] = [{ start: lo, end: hi }];
      continue;
    }
    const gaps: { start: number; end: number }[] = [];
    let cursor = lo;
    for (const s of slots) {
      if (s.start > cursor) gaps.push({ start: cursor, end: s.start });
      cursor = Math.max(cursor, s.end);
    }
    if (cursor < hi) gaps.push({ start: cursor, end: hi });
    if (gaps.length > 0) result[day] = gaps;
  }
  return result;
}

/** Convierte franjas del profesor ({ dayOfWeek, startHour, endHour }) a TimeRange. */
export function teacherAvailsToRanges(
  avails: { dayOfWeek: number; startHour: number; endHour: number }[],
): TimeRange[] {
  return avails.map((a) => ({ day: a.dayOfWeek, start: a.startHour, end: a.endHour }));
}

/**
 * Horas válidas. Si `maxDurationMin` está definido, el fin puede ser cualquier parte
 * ≤ ese máximo (p. ej. 30 o 60 para una clase de 60 min).
 */
export function getSlotHourSetsFromRanges(
  ranges: { start: number; end: number }[],
  hoursStart: { value: string; label: string }[],
  hoursEnd: { value: string; label: string }[],
  selectedStart?: string,
  maxDurationMin?: number,
) {
  let startSet: Set<string>;
  if (maxDurationMin != null && maxDurationMin > 0) {
    const minPart = durationPartOptions(maxDurationMin)[0] ?? maxDurationMin;
    startSet = new Set<string>();
    for (const r of ranges) {
      for (const o of hoursStart) {
        const v = Number(o.value);
        if (durationFitsInInterval(v, minPart, r)) startSet.add(o.value);
      }
    }
  } else {
    startSet = allowedHourSet(ranges, hoursStart, "start");
  }

  let endSet: Set<string>;
  if (maxDurationMin != null && maxDurationMin > 0 && selectedStart !== undefined && selectedStart !== "") {
    endSet = new Set<string>();
    const s = Number(selectedStart);
    const containing = ranges.find((r) => s >= r.start && s < r.end);
    if (containing) {
      for (const d of durationPartOptions(maxDurationMin)) {
        if (durationFitsInInterval(s, d, containing)) {
          endSet.add(String(endHourFromDuration(s, d)));
        }
      }
    }
  } else if (selectedStart !== undefined && selectedStart !== "") {
    const s = Number(selectedStart);
    const containing = ranges.find((r) => s >= r.start && s < r.end);
    endSet = containing
      ? allowedHourSet([containing], hoursEnd, "end", s)
      : new Set<string>();
  } else {
    endSet = allowedHourSet(ranges, hoursEnd, "end");
  }

  return { startSet, endSet, ranges };
}

/** Huecos libres en un día restando bloqueos (ventana del calendario por defecto). */
export function getFreeRangesExcludingBlocked(
  day: number,
  blocked: TimeRange[],
  windowStart = SCHEDULE_DAY_START,
  windowEnd = SCHEDULE_SELECT_END,
): { start: number; end: number }[] {
  return getEffectiveRangesForDay(
    day,
    [{ dayOfWeek: day, startHour: windowStart, endHour: windowEnd }],
    [],
    blocked,
  );
}

/** Horas válidas comunes a varios días, restando bloqueos. */
export function getFreeHourSetsForDays(
  days: number[],
  blocked: TimeRange[],
  hoursStart: { value: string; label: string }[],
  hoursEnd: { value: string; label: string }[],
  selectedStart?: string,
  durationMin?: number,
): { startSet: Set<string>; endSet: Set<string> } {
  if (days.length === 0) return { startSet: new Set(), endSet: new Set() };
  const perDay = days.map((day) => {
    const ranges = getFreeRangesExcludingBlocked(day, blocked);
    return getSlotHourSetsFromRanges(ranges, hoursStart, hoursEnd, selectedStart, durationMin);
  });
  let startSet = perDay[0].startSet;
  let endSet = perDay[0].endSet;
  for (let i = 1; i < perDay.length; i++) {
    startSet = new Set([...startSet].filter((v) => perDay[i].startSet.has(v)));
    endSet = new Set([...endSet].filter((v) => perDay[i].endSet.has(v)));
  }
  return { startSet, endSet };
}

/** Conjuntos de horas válidas para selects de solicitudes (profesor ∩ alumno − bloqueos). */
export function getSlotHourSets(
  day: number,
  teacherAvails: { dayOfWeek: number; startHour: number; endHour: number }[],
  studentAvailable: TimeRange[],
  studentBlocked: TimeRange[],
  hoursStart: { value: string; label: string }[],
  hoursEnd: { value: string; label: string }[],
  selectedStart?: string,
  durationMin?: number,
) {
  const ranges = getEffectiveRangesForDay(day, teacherAvails, studentAvailable, studentBlocked);
  return getSlotHourSetsFromRanges(ranges, hoursStart, hoursEnd, selectedStart, durationMin);
}

/** Ajusta inicio/fin a horas permitidas; devuelve vacío si no hay opciones. */
export function snapSlotHours(
  day: number,
  teacherAvails: { dayOfWeek: number; startHour: number; endHour: number }[],
  studentAvailable: TimeRange[],
  studentBlocked: TimeRange[],
  hoursStart: { value: string; label: string }[],
  hoursEnd: { value: string; label: string }[],
  currentStart: string,
  currentEnd: string,
  durationMin?: number,
): { start: string; end: string } {
  const { startSet } = getSlotHourSets(
    day,
    teacherAvails,
    studentAvailable,
    studentBlocked,
    hoursStart,
    hoursEnd,
    currentStart,
    durationMin,
  );
  if (startSet.size === 0) return { start: "", end: "" };
  const start = startSet.has(currentStart) ? currentStart : Array.from(startSet)[0];
  const { endSet } = getSlotHourSets(
    day,
    teacherAvails,
    studentAvailable,
    studentBlocked,
    hoursStart,
    hoursEnd,
    start,
    durationMin,
  );
  if (endSet.size === 0) return { start, end: "" };
  if (endSet.has(currentEnd) && Number(currentEnd) > Number(start)) return { start, end: currentEnd };
  if (durationMin != null && durationMin > 0) {
    const full = String(endHourFromDuration(Number(start), durationMin));
    if (endSet.has(full)) return { start, end: full };
  }
  const after = Array.from(endSet)
    .filter((x) => Number(x) > Number(start))
    .sort((a, b) => Number(a) - Number(b));
  return { start, end: after[after.length - 1] ?? after[0] ?? "" };
}
