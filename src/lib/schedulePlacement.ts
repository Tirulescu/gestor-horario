import { endHourFromDuration, slotStartsForDuration } from "@/lib/hours";
import { freeWithinStudentAvailability, type TimeRange } from "@/lib/studentAvailability";
import { type Interval } from "@/lib/scheduleIntervals";

export interface SlotRequestPref {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  prefOrder: number;
}

export interface PlacedSlot {
  day: number;
  start: number;
  end: number;
  /** 1..n = opción del alumno; 0 = fallback a disponibilidad; null = sin peticiones */
  prefOrder: number | null;
}

function findFirstSlot(
  freeByDay: Record<number, Interval[]>,
  durationMin: number,
  canPlace: (day: number, start: number, end: number) => boolean,
): { day: number; start: number; end: number } | null {
  const days = Object.keys(freeByDay)
    .map(Number)
    .sort((a, b) => a - b);
  for (const day of days) {
    for (const f of freeByDay[day] ?? []) {
      for (const start of slotStartsForDuration(f, durationMin)) {
        const end = endHourFromDuration(start, durationMin);
        if (canPlace(day, start, end)) return { day, start, end };
      }
    }
  }
  return null;
}

/** Todos los inicios de 30 min donde cabe la duración dentro de la ventana ∩ huecos libres. */
function findSlotInWindow(
  free: Interval[],
  windowStart: number,
  windowEnd: number,
  durationMin: number,
  canPlace: (start: number, end: number) => boolean,
): { start: number; end: number } | null {
  for (const f of free) {
    const startBound = Math.max(f.start, windowStart);
    const endBound = Math.min(f.end, windowEnd);
    if (endBound <= startBound + 1e-9) continue;
    for (const start of slotStartsForDuration({ start: startBound, end: endBound }, durationMin)) {
      const end = endHourFromDuration(start, durationMin);
      if (canPlace(start, end)) return { start, end };
    }
  }
  return null;
}

function searchSpaceForStudent(
  currentFree: Record<number, Interval[]>,
  studentAvailable: TimeRange[],
): Record<number, Interval[]> {
  if (studentAvailable.length === 0) return currentFree;
  return freeWithinStudentAvailability(currentFree, studentAvailable);
}

/**
 * Coloca UNA sesión: primero las solicitudes del alumno (por prefOrder),
 * luego cualquier hueco dentro de su disponibilidad (y la del profesor).
 * Nunca propone un hueco fuera de disponibilidad / con solape: eso lo filtra `canPlace`.
 */
export function placeIndividualSlot(params: {
  durationMin: number;
  requests: SlotRequestPref[];
  currentFree: Record<number, Interval[]>;
  studentAvailable: TimeRange[];
  canPlace: (day: number, start: number, end: number) => boolean;
}): PlacedSlot | null {
  const { durationMin, requests, currentFree, studentAvailable, canPlace } = params;
  const sortedReqs = [...requests].sort((a, b) => a.prefOrder - b.prefOrder);

  for (const req of sortedReqs) {
    const hit = findSlotInWindow(
      currentFree[req.dayOfWeek] ?? [],
      req.startHour,
      req.endHour,
      durationMin,
      (start, end) => canPlace(req.dayOfWeek, start, end),
    );
    if (hit) {
      return { day: req.dayOfWeek, start: hit.start, end: hit.end, prefOrder: req.prefOrder };
    }
  }

  const search = searchSpaceForStudent(currentFree, studentAvailable);
  const fallback = findFirstSlot(search, durationMin, canPlace);
  if (!fallback) return null;
  return {
    ...fallback,
    prefOrder: sortedReqs.length > 0 ? 0 : null,
  };
}

export function unassignedReason(params: {
  teacherHasAvailability: boolean;
  studentAvailable: TimeRange[];
}): string {
  if (!params.teacherHasAvailability) return "sin disponibilidad del profesor";
  if (params.studentAvailable.length > 0) return "sin hueco libre dentro de su disponibilidad";
  return "sin hueco libre que encaje";
}
