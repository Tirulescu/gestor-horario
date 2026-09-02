import { endHourFromDuration, fmtHour } from "@/lib/hours";
import { getSlotHourSets, normalizeRanges } from "@/lib/studentAvailability";
import type { Availability, Student } from "./types";

type HourOption = { value: string; label: string };

export function hourSetsForStudent(
  day: number,
  student: Student | undefined,
  availabilities: Availability[],
  hoursStart: HourOption[],
  hoursEnd: HourOption[],
  selectedStart?: string,
  durationMin?: number,
) {
  return getSlotHourSets(
    day,
    availabilities,
    normalizeRanges(student?.availableRanges),
    normalizeRanges(student?.blockedRanges),
    hoursStart,
    hoursEnd,
    selectedStart,
    durationMin,
  );
}

export function pickEndForStart(
  endSet: Set<string>,
  start: string,
  preferredEnd: string,
  maxDuration: number | null,
): string {
  if (endSet.size === 0) return "";
  if (preferredEnd && endSet.has(preferredEnd) && Number(preferredEnd) > Number(start)) return preferredEnd;
  if (maxDuration != null) {
    const full = String(endHourFromDuration(Number(start), maxDuration));
    if (endSet.has(full)) return full;
  }
  const after = Array.from(endSet)
    .filter((x) => Number(x) > Number(start))
    .sort((a, b) => Number(a) - Number(b));
  return after[after.length - 1] ?? "";
}

/** Resuelve la hora de inicio al cambiar de día (conserva la actual si sigue válida). */
export function resolveStartForDay(startSet: Set<string>, currentStart: string): string {
  return startSet.has(currentStart) ? currentStart : (startSet.size > 0 ? Array.from(startSet)[0] : "");
}

export function endOptions(endSet: Set<string>) {
  return Array.from(endSet)
    .sort((a, b) => Number(a) - Number(b))
    .map((v) => ({ value: v, label: fmtHour(Number(v)) }));
}
