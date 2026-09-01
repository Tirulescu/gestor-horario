/**
 * Lógica pura para agendar asignaturas colectivas:
 * busca un único hueco con la duración exacta de la asignatura donde quepan el máximo de alumnos.
 */

import { endHourFromDuration, slotStartsForDuration } from "@/lib/hours";
import { slotWithinAvailable, type TimeRange } from "@/lib/studentAvailability";

export interface Interval { start: number; end: number; }

export interface CollectiveMember {
  studentId: number;
  studentName: string;
  priority: number;
  requests: { dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[];
  /** Franjas disponibles del alumno; se usan como opciones implícitas si no hay solicitud que encaje. */
  availableRanges?: TimeRange[];
}

export function prefScoreForSlot(
  requests: CollectiveMember["requests"],
  day: number,
  start: number,
  end: number,
  availableRanges: TimeRange[] = [],
): number {
  for (const req of requests) {
    if (req.dayOfWeek !== day) continue;
    const interStart = Math.max(start, req.startHour);
    const interEnd = Math.min(end, req.endHour);
    if (interEnd - interStart >= end - start - 1e-9) return req.prefOrder;
  }
  if (availableRanges.length > 0 && slotWithinAvailable(day, start, end, availableRanges)) {
    return 0;
  }
  return 100;
}

export interface CollectiveSlotResult {
  slot: { day: number; start: number; end: number } | null;
  fitting: CollectiveMember[];
  /** Número total de alumnos inscritos en la asignatura. */
  totalMembers: number;
}

/**
 * Encuentra el hueco donde caben más alumnos de la asignatura colectiva.
 * La duración del hueco es exactamente `durationMin` (la definida en la asignatura).
 *
 * Criterios (en orden):
 * 1. Máximo número de alumnos que pueden asistir.
 * 2. Mejor coincidencia con posibilidades de horario (prefOrder más bajo).
 * 3. Mayor prioridad de los alumnos incluidos (priority más bajo).
 */
export function findBestCollectiveSlot(
  members: CollectiveMember[],
  durationMin: number,
  currentFree: Record<number, Interval[]>,
  canAttend: (studentId: number, day: number, start: number, end: number) => boolean,
): CollectiveSlotResult {
  if (members.length === 0 || durationMin < 1) {
    return { slot: null, fitting: [], totalMembers: members.length };
  }

  let best: {
    slot: { day: number; start: number; end: number };
    fitting: CollectiveMember[];
    count: number;
    prefSum: number;
    prioritySum: number;
  } | null = null;

  for (const dStr of Object.keys(currentFree)) {
    const day = Number(dStr);
    for (const f of currentFree[day] ?? []) {
      for (const start of slotStartsForDuration(f, durationMin)) {
        const end = endHourFromDuration(start, durationMin);
        const fitting = members.filter((m) => canAttend(m.studentId, day, start, end));
        if (fitting.length === 0) continue;

        const prefSum = fitting.reduce(
          (s, m) => s + prefScoreForSlot(m.requests, day, start, end, m.availableRanges ?? []),
          0,
        );
        const prioritySum = fitting.reduce((s, m) => s + m.priority, 0);

        if (
          !best
          || fitting.length > best.count
          || (fitting.length === best.count && prefSum < best.prefSum)
          || (fitting.length === best.count && prefSum === best.prefSum && prioritySum < best.prioritySum)
        ) {
          best = { slot: { day, start, end }, fitting, count: fitting.length, prefSum, prioritySum };
        }
      }
    }
  }

  return best
    ? { slot: best.slot, fitting: best.fitting, totalMembers: members.length }
    : { slot: null, fitting: [], totalMembers: members.length };
}
