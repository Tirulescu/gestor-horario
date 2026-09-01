import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeRanges, slotOverlapsBlocked, slotWithinAvailable } from "@/lib/studentAvailability";

function overlaps(
  dayA: number,
  startA: number,
  endA: number,
  dayB: number,
  startB: number,
  endB: number,
): boolean {
  if (dayA !== dayB) return false;
  return endA > startB && startA < endB;
}

export async function validateAssignmentSlot(params: {
  teacherId: number;
  studentIds: number[];
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  excludeAssignmentIds?: number[];
  excludeCollectiveSessionId?: string | null;
}): Promise<string | null> {
  const {
    teacherId,
    studentIds,
    dayOfWeek,
    startHour,
    endHour,
    excludeAssignmentIds = [],
    excludeCollectiveSessionId,
  } = params;

  const excludeIds = new Set(excludeAssignmentIds);

  const teacherAssignments = await db.query.assignments.findMany({
    where: eq(schema.assignments.teacherId, teacherId),
    columns: {
      id: true,
      dayOfWeek: true,
      startHour: true,
      endHour: true,
      collectiveSessionId: true,
    },
  });

  for (const a of teacherAssignments) {
    if (excludeIds.has(a.id)) continue;
    if (excludeCollectiveSessionId && a.collectiveSessionId === excludeCollectiveSessionId) continue;
    if (overlaps(dayOfWeek, startHour, endHour, a.dayOfWeek, a.startHour, a.endHour)) {
      return "Ese horario choca con otra clase del profesor";
    }
  }

  const blocks = await db.query.teacherBlocks.findMany({
    where: eq(schema.teacherBlocks.teacherId, teacherId),
    columns: { dayOfWeek: true, startHour: true, endHour: true },
  });
  for (const b of blocks) {
    if (overlaps(dayOfWeek, startHour, endHour, b.dayOfWeek, b.startHour, b.endHour)) {
      return "Ese horario choca con una reserva del profesor";
    }
  }

  const avails = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, teacherId),
    columns: { dayOfWeek: true, startHour: true, endHour: true },
  });
  const inAvailability = avails.some(
    (a) => a.dayOfWeek === dayOfWeek && a.startHour <= startHour && a.endHour >= endHour,
  );
  if (!inAvailability) {
    return "Fuera de la disponibilidad del profesor";
  }

  if (studentIds.length === 0) return null;

  const students = await db.query.students.findMany({
    where: inArray(schema.students.id, studentIds),
    columns: { id: true, blockedRanges: true, availableRanges: true },
  });

  const studentAssignments = await db.query.assignments.findMany({
    where: inArray(schema.assignments.studentId, studentIds),
    columns: {
      id: true,
      studentId: true,
      dayOfWeek: true,
      startHour: true,
      endHour: true,
      collectiveSessionId: true,
    },
  });

  for (const studentId of studentIds) {
    const st = students.find((s) => s.id === studentId);
    if (!st) return "Alumno no encontrado";

    const blocked = normalizeRanges(st.blockedRanges);
    const available = normalizeRanges(st.availableRanges);
    if (slotOverlapsBlocked(dayOfWeek, startHour, endHour, blocked)) {
      return "Ese horario choca con una hora bloqueada del alumno";
    }
    if (!slotWithinAvailable(dayOfWeek, startHour, endHour, available)) {
      return "Fuera del horario disponible del alumno";
    }

    for (const a of studentAssignments) {
      if (a.studentId !== studentId) continue;
      if (excludeIds.has(a.id)) continue;
      if (excludeCollectiveSessionId && a.collectiveSessionId === excludeCollectiveSessionId) continue;
      if (overlaps(dayOfWeek, startHour, endHour, a.dayOfWeek, a.startHour, a.endHour)) {
        return "Ese horario choca con otra clase del alumno";
      }
    }
  }

  return null;
}
