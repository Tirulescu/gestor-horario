import {
  durationFitsInInterval,
  endHourFromDuration,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
  slotMatchesDuration,
} from "./hours";

/** Franja horaria semanal: day 0=Lun … 6=Dom, start/end en horas decimales. */
export type TimeRange = { day: number; start: number; end: number; title?: string };

export function normalizeRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return [];
  return raw
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
  return raw
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

/** Primera franja de disponibilidad que solapa con algún bloqueo. */
export function firstAvailabilityBlockedConflict(
  available: TimeRange[],
  blocked: TimeRange[],
): TimeRange | null {
  for (const a of available) {
    if (slotOverlapsBlocked(a.day, a.start, a.end, blocked)) return a;
  }
  return null;
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

  if (requiredDurationMin != null && requiredDurationMin > 0 && !slotMatchesDuration(start, end, requiredDurationMin)) {
    return `La solicitud debe durar exactamente ${requiredDurationMin} min`;
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

function intersectRangeLists(
  a: { start: number; end: number }[],
  b: { start: number; end: number }[],
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const ra of a) {
    for (const rb of b) {
      const start = Math.max(ra.start, rb.start);
      const end = Math.min(ra.end, rb.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/** Franjas válidas para una asignación (profesor ∩ alumno(s) − bloqueos). */
export function getAssignmentEffectiveRanges(
  day: number,
  teacherAvails: { dayOfWeek: number; startHour: number; endHour: number }[],
  students: { available: TimeRange[]; blocked: TimeRange[] }[],
): { start: number; end: number }[] {
  if (students.length === 0) {
    return teacherAvails
      .filter((a) => a.dayOfWeek === day)
      .map((a) => ({ start: a.startHour, end: a.endHour }));
  }
  let ranges = getEffectiveRangesForDay(day, teacherAvails, students[0].available, students[0].blocked);
  for (let i = 1; i < students.length; i++) {
    ranges = intersectRangeLists(
      ranges,
      getEffectiveRangesForDay(day, teacherAvails, students[i].available, students[i].blocked),
    );
  }
  return ranges;
}

export function getSlotHourSetsFromRanges(
  ranges: { start: number; end: number }[],
  hoursStart: { value: string; label: string }[],
  hoursEnd: { value: string; label: string }[],
  selectedStart?: string,
  durationMin?: number,
) {
  let startSet: Set<string>;
  if (durationMin != null && durationMin > 0) {
    startSet = new Set<string>();
    for (const r of ranges) {
      for (const o of hoursStart) {
        const v = Number(o.value);
        if (durationFitsInInterval(v, durationMin, r)) startSet.add(o.value);
      }
    }
  } else {
    startSet = allowedHourSet(ranges, hoursStart, "start");
  }

  let endSet: Set<string>;
  if (durationMin != null && durationMin > 0 && selectedStart !== undefined && selectedStart !== "") {
    endSet = new Set([String(endHourFromDuration(Number(selectedStart), durationMin))]);
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

/** Huecos libres en un día restando bloqueos (ventana completa por defecto). */
export function getFreeRangesExcludingBlocked(
  day: number,
  blocked: TimeRange[],
  windowStart = 8,
  windowEnd = 24,
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
): { startSet: Set<string>; endSet: Set<string> } {
  if (days.length === 0) return { startSet: new Set(), endSet: new Set() };
  const perDay = days.map((day) => {
    const ranges = getFreeRangesExcludingBlocked(day, blocked);
    return getSlotHourSetsFromRanges(ranges, hoursStart, hoursEnd, selectedStart);
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
  if (durationMin != null && durationMin > 0) {
    return { start, end: String(endHourFromDuration(Number(start), durationMin)) };
  }
  const { endSet } = getSlotHourSets(day, teacherAvails, studentAvailable, studentBlocked, hoursStart, hoursEnd, start);
  if (endSet.size === 0) return { start, end: "" };
  if (endSet.has(currentEnd) && Number(currentEnd) > Number(start)) return { start, end: currentEnd };
  const after = Array.from(endSet).filter((x) => Number(x) > Number(start));
  return { start, end: after[0] ?? Array.from(endSet)[endSet.size - 1] };
}
