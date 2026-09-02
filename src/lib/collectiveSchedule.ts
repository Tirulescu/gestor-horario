/**
 * Lógica pura para agendar asignaturas colectivas:
 * un único hueco de duración exacta. Ante todo maximiza cuántos alumnos
 * pueden asistir; a igualdad, prioridad y luego solicitudes.
 */

import { endHourFromDuration, slotStartsForDuration } from "@/lib/hours";
import type { Interval } from "@/lib/scheduleIntervals";
import { slotWithinAvailable, type TimeRange } from "@/lib/studentAvailability";

export interface CollectiveMember {
  studentId: number;
  studentName: string;
  priority: number;
  requests: { dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[];
  /** Franjas disponibles del alumno; se usan como opciones implícitas si no hay solicitud que encaje. */
  availableRanges?: TimeRange[];
}

/** Puntuación si el hueco solo encaja por disponibilidad, no por una solicitud. */
export const PREF_AVAILABLE = 50;
/** Puntuación si el hueco no casa con solicitud ni disponibilidad explícita. */
export const PREF_NO_MATCH = 100;

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
    return PREF_AVAILABLE;
  }
  return PREF_NO_MATCH;
}

/** Valor persistido/mostrado: 1..n solicitud, 0 disponibilidad, null sin petición. */
export function prefOrderFromScore(score: number): number | null {
  if (score < PREF_AVAILABLE) return score;
  if (score === PREF_AVAILABLE) return 0;
  return null;
}

export interface CollectiveSlotResult {
  slot: { day: number; start: number; end: number } | null;
  fitting: CollectiveMember[];
  /** Número total de alumnos inscritos en la asignatura. */
  totalMembers: number;
}

function attendanceByPriorityTier(fitting: CollectiveMember[]): number[] {
  const maxP = fitting.reduce((m, x) => Math.max(m, x.priority), 0);
  const counts = Array.from({ length: Math.max(maxP, 1) }, () => 0);
  for (const m of fitting) {
    const idx = Math.max(1, m.priority) - 1;
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  return counts;
}

function comparePriorityTiers(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Encuentra el hueco de duración exacta `durationMin` para la sesión colectiva.
 *
 * Criterios (en orden):
 * 1. Máximo número de alumnos que pueden asistir (disponibilidad).
 * 2. A igualdad, mejor cobertura de alumnos de mayor prioridad.
 * 3. A igualdad, mejor coincidencia con solicitudes.
 * 4. Día y hora más tempranos (estable).
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
    tiers: number[];
    prefSum: number;
  } | null = null;

  const days = Object.keys(currentFree)
    .map(Number)
    .sort((a, b) => a - b);

  for (const day of days) {
    for (const f of currentFree[day] ?? []) {
      for (const start of slotStartsForDuration(f, durationMin)) {
        const end = endHourFromDuration(start, durationMin);
        const fitting = members.filter((m) => canAttend(m.studentId, day, start, end));
        if (fitting.length === 0) continue;

        const prefSum = fitting.reduce(
          (s, m) => s + prefScoreForSlot(m.requests, day, start, end, m.availableRanges ?? []),
          0,
        );
        const tiers = attendanceByPriorityTier(fitting);
        const count = fitting.length;
        const tierCmp = best ? comparePriorityTiers(tiers, best.tiers) : 1;

        const better =
          !best
          || count > best.count
          || (count === best.count && tierCmp > 0)
          || (count === best.count && tierCmp === 0 && prefSum < best.prefSum)
          || (
            count === best.count
            && tierCmp === 0
            && prefSum === best.prefSum
            && (day < best.slot.day || (day === best.slot.day && start < best.slot.start))
          );

        if (better) {
          best = { slot: { day, start, end }, fitting, count, tiers, prefSum };
        }
      }
    }
  }

  return best
    ? { slot: best.slot, fitting: best.fitting, totalMembers: members.length }
    : { slot: null, fitting: [], totalMembers: members.length };
}
