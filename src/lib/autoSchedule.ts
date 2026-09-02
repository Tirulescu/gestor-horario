import { randomUUID } from "crypto";
import { normalizeRanges, slotWithinAvailable } from "@/lib/studentAvailability";
import {
  findBestCollectiveSlot,
  prefOrderFromScore,
  prefScoreForSlot,
  type CollectiveMember,
} from "@/lib/collectiveSchedule";
import { cloneFreeByDay, mergeFreeByDay, occupy, type Interval } from "@/lib/scheduleIntervals";
import { placeIndividualSlot, placeSplitParts, unassignedReason } from "@/lib/schedulePlacement";
import { SESSION_PART_MIN, maxSessionParts, sessionPartsFitDuration } from "@/lib/hours";
import { db, schema, type Database } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import type {
  AutoScheduleAssigned,
  AutoScheduleResult,
  AutoScheduleUnassigned,
} from "@/lib/autoScheduleTypes";

export type {
  AutoScheduleAssigned,
  AutoScheduleResult,
  AutoScheduleUnassigned,
} from "@/lib/autoScheduleTypes";

export interface AutoScheduleOptions {
  /** Si se indica, solo se auto-agendan estas asignaturas (deben no estar fijadas). */
  subjectIds?: number[];
}

interface Task {
  subjectId: number;
  subjectName: string;
  subjectOrder: number;
  studentId: number;
  studentName: string;
  priority: number;
  durationMin: number;
  sessionParts: number;
  requests: { dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[];
}

interface CollectiveSubjectTask {
  subjectId: number;
  subjectName: string;
  subjectOrder: number;
  durationMin: number;
  members: CollectiveMember[];
}

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

export async function autoScheduleByTeacher(
  teacherId: number,
  options: AutoScheduleOptions = {},
  conn: Database = db,
): Promise<AutoScheduleResult> {
  const teacher = await conn.query.teachers.findFirst({ where: eq(schema.teachers.id, teacherId) });
  if (!teacher) throw new Error("Profesor no encontrado");

  const allSubjects = await conn.query.subjects.findMany({
    where: eq(schema.subjects.teacherId, teacherId),
    orderBy: (s, { asc }) => [asc(s.id)],
  });
  if (allSubjects.length === 0) {
    return { assigned: [], unassigned: [] };
  }

  if (teacher.scheduleFixed) {
    return {
      assigned: [],
      unassigned: [],
      skipped: allSubjects.map((s) => ({
        subjectId: s.id,
        subjectName: s.name,
        reason: "horario fijado",
      })),
    };
  }

  const skipped: { subjectId: number; subjectName: string; reason: string }[] = [];
  let targetSubjects = allSubjects.filter((s) => !s.scheduleFixed);

  if (options.subjectIds?.length) {
    const wanted = new Set(options.subjectIds);
    for (const s of allSubjects) {
      if (wanted.has(s.id) && s.scheduleFixed) {
        skipped.push({ subjectId: s.id, subjectName: s.name, reason: "horario fijado" });
      }
    }
    targetSubjects = allSubjects.filter((s) => wanted.has(s.id) && !s.scheduleFixed);
  }

  if (targetSubjects.length === 0) {
    return { assigned: [], unassigned: [], skipped };
  }

  const subjectsList = targetSubjects;
  const targetSubjectIds = new Set(subjectsList.map((s) => s.id));
  const subjectIds = subjectsList.map((s) => s.id);
  const subjectOrder = new Map(subjectIds.map((id, i) => [id, i]));

  const allSS = subjectIds.length > 0
    ? await conn.query.subjectStudents.findMany({
        where: inArray(schema.subjectStudents.subjectId, subjectIds),
        with: { student: true },
      })
    : [];

  const allReq: { subjectId: number; studentId: number; dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[] = [];
  if (subjectIds.length > 0) {
    const reqRows = await conn.query.slotRequests.findMany({
      where: inArray(schema.slotRequests.subjectId, subjectIds),
    });
    for (const r of reqRows) {
      allReq.push({
        subjectId: r.subjectId,
        studentId: r.studentId,
        dayOfWeek: r.dayOfWeek,
        startHour: r.startHour,
        endHour: r.endHour,
        prefOrder: r.prefOrder ?? r.id,
      });
    }
  }

  const individualTasks: Task[] = [];
  const collectiveTasks: CollectiveSubjectTask[] = [];

  const allStudentIds = Array.from(new Set(allSS.map((m) => m.studentId)));

  const blockedByStudent: Record<number, Record<number, { start: number; end: number }[]>> = {};
  const availableByStudent: Record<number, { day: number; start: number; end: number }[]> = {};
  if (allStudentIds.length > 0) {
    const srows = await conn.query.students.findMany({ where: inArray(schema.students.id, allStudentIds) });
    for (const st of srows) {
      const blocked = normalizeRanges((st as { blockedRanges?: unknown }).blockedRanges);
      const byDay: Record<number, { start: number; end: number }[]> = {};
      for (const b of blocked) {
        (byDay[b.day] ??= []).push({ start: b.start, end: b.end });
      }
      blockedByStudent[st.id] = byDay;
      availableByStudent[st.id] = normalizeRanges((st as { availableRanges?: unknown }).availableRanges);
    }
  }

  for (const s of subjectsList) {
    const ss = allSS.filter((x) => x.subjectId === s.id);
    if (s.isCollective) {
      const members: CollectiveMember[] = ss.map((m) => {
        const reqs = allReq
          .filter((r) => r.subjectId === s.id && r.studentId === m.studentId)
          .map((r) => ({ dayOfWeek: r.dayOfWeek, startHour: r.startHour, endHour: r.endHour, prefOrder: r.prefOrder }))
          .sort((x, y) => x.prefOrder - y.prefOrder);
        return {
          studentId: m.studentId,
          studentName: m.student?.name ?? `alumno ${m.studentId}`,
          priority: m.priority,
          requests: reqs,
          availableRanges: availableByStudent[m.studentId] ?? [],
        };
      });
      if (members.length > 0) {
        collectiveTasks.push({
          subjectId: s.id,
          subjectName: s.name,
          subjectOrder: subjectOrder.get(s.id) ?? 0,
          durationMin: s.defaultDurationMin,
          members,
        });
      }
      continue;
    }

    for (const m of ss) {
      const durationMin = m.durationMin ?? s.defaultDurationMin;
      const rawParts = Math.max(1, m.sessionParts ?? 1);
      const sessionParts =
        rawParts > 1 && !sessionPartsFitDuration(durationMin, rawParts)
          ? maxSessionParts(durationMin)
          : rawParts;
      const reqs = allReq
        .filter((r) => r.subjectId === s.id && r.studentId === m.studentId)
        .map((r) => ({ dayOfWeek: r.dayOfWeek, startHour: r.startHour, endHour: r.endHour, prefOrder: r.prefOrder }))
        .sort((x, y) => x.prefOrder - y.prefOrder);
      individualTasks.push({
        subjectId: s.id,
        subjectName: s.name,
        subjectOrder: subjectOrder.get(s.id) ?? 0,
        studentId: m.studentId,
        studentName: m.student?.name ?? `alumno ${m.studentId}`,
        priority: m.priority,
        durationMin,
        sessionParts,
        requests: reqs,
      });
    }
  }

  const blockedHere = (studentId: number, day: number, start: number, end: number) =>
    ((blockedByStudent[studentId] ?? {})[day] ?? []).some((b) => b.end > start && b.start < end);
  const withinAvailable = (studentId: number, day: number, start: number, end: number) =>
    slotWithinAvailable(day, start, end, availableByStudent[studentId] ?? []);

  collectiveTasks.sort((a, b) => a.subjectOrder - b.subjectOrder || a.subjectName.localeCompare(b.subjectName));
  individualTasks.sort((a, b) =>
    a.priority - b.priority || a.subjectOrder - b.subjectOrder || a.studentName.localeCompare(b.studentName),
  );

  const availabilities = await conn.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, teacherId),
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
  });

  const freeByDay: Record<number, Interval[]> = {};
  for (const a of availabilities) {
    freeByDay[a.dayOfWeek] = freeByDay[a.dayOfWeek] ?? [];
    freeByDay[a.dayOfWeek].push({ start: a.startHour, end: a.endHour });
  }
  const currentFree = cloneFreeByDay(mergeFreeByDay(freeByDay));

  const teacherAssignments = await conn.query.assignments.findMany({
    where: eq(schema.assignments.teacherId, teacherId),
  });

  const studentAssignments = allStudentIds.length > 0
    ? await conn.query.assignments.findMany({
        where: inArray(schema.assignments.studentId, allStudentIds),
      })
    : [];

  const isBeingRescheduled = (a: { teacherId: number; subjectId: number; origin: string }) =>
    a.teacherId === teacherId && targetSubjectIds.has(a.subjectId) && a.origin === "auto";

  const placedByStudent: Record<number, { day: number; start: number; end: number }[]> = {};
  for (const a of studentAssignments) {
    if (isBeingRescheduled(a)) continue;
    (placedByStudent[a.studentId] ??= []).push({
      day: a.dayOfWeek,
      start: a.startHour,
      end: a.endHour,
    });
  }

  for (const a of teacherAssignments) {
    if (isBeingRescheduled(a)) continue;
    occupy(currentFree, a.dayOfWeek, { start: a.startHour, end: a.endHour });
  }

  const tBlocks = await conn.query.teacherBlocks.findMany({
    where: eq(schema.teacherBlocks.teacherId, teacherId),
  });
  for (const b of tBlocks) {
    occupy(currentFree, b.dayOfWeek, { start: b.startHour, end: b.endHour });
  }

  const assigned: AutoScheduleAssigned[] = [];
  const unassigned: AutoScheduleUnassigned[] = [];
  const plannedInserts: (typeof schema.assignments.$inferInsert)[] = [];

  const studentBusy = (studentId: number, day: number, start: number, end: number) => {
    if (blockedHere(studentId, day, start, end)) return true;
    if (!withinAvailable(studentId, day, start, end)) return true;
    return (placedByStudent[studentId] ?? []).some(
      (s) => s.day === day && s.end > start && s.start < end,
    );
  };

  const teacherBusy = (day: number, start: number, end: number) =>
    plannedInserts.some((p) => overlaps(day, start, end, p.dayOfWeek, p.startHour, p.endHour));

  function placeCollective(cTask: CollectiveSubjectTask) {
    const { slot, fitting, totalMembers } = findBestCollectiveSlot(
      cTask.members,
      cTask.durationMin,
      currentFree,
      (studentId, day, start, end) =>
        !studentBusy(studentId, day, start, end) && !teacherBusy(day, start, end),
    );

    if (slot && fitting.length > 0) {
      const sessionId = randomUUID();
      for (const m of fitting) {
        const pref = prefScoreForSlot(
          m.requests,
          slot.day,
          slot.start,
          slot.end,
          availableByStudent[m.studentId] ?? [],
        );
        const metPref = prefOrderFromScore(pref);
        plannedInserts.push({
          teacherId,
          subjectId: cTask.subjectId,
          studentId: m.studentId,
          dayOfWeek: slot.day,
          startHour: slot.start,
          endHour: slot.end,
          origin: "auto",
          prefOrder: metPref,
          collectiveSessionId: sessionId,
        });
        assigned.push({
          studentId: m.studentId,
          studentName: m.studentName,
          subjectId: cTask.subjectId,
          subjectName: cTask.subjectName,
          day: slot.day,
          startHour: slot.start,
          endHour: slot.end,
          prefOrder: metPref,
          isCollective: true,
          collectiveSessionId: sessionId,
        });
        (placedByStudent[m.studentId] ??= []).push(slot);
      }
      occupy(currentFree, slot.day, { start: slot.start, end: slot.end });

      const fittingIds = new Set(fitting.map((f) => f.studentId));
      const notFitting = cTask.members.filter((m) => !fittingIds.has(m.studentId));
      for (const m of notFitting) {
        unassigned.push({
          studentId: m.studentId,
          studentName: m.studentName,
          subjectId: cTask.subjectId,
          subjectName: cTask.subjectName,
          reason: `no disponible en el horario colectivo elegido (${fitting.length}/${totalMembers} alumnos en la sesión)`,
        });
      }
      return;
    }

    for (const m of cTask.members) {
      unassigned.push({
        studentId: m.studentId,
        studentName: m.studentName,
        subjectId: cTask.subjectId,
        subjectName: cTask.subjectName,
        reason: unassignedReason({
          teacherHasAvailability: availabilities.length > 0,
          studentAvailable: availableByStudent[m.studentId] ?? [],
        }),
      });
    }
  }

  function placeIndividual(task: Task) {
    const parts = Math.max(1, task.sessionParts);
    const placedList =
      parts > 1
        ? placeSplitParts({
            parts,
            partDurationMin: SESSION_PART_MIN,
            requests: task.requests,
            currentFree,
            studentAvailable: availableByStudent[task.studentId] ?? [],
            canPlace: (day, start, end) =>
              !studentBusy(task.studentId, day, start, end) && !teacherBusy(day, start, end),
            separateParts: true,
          })
        : (() => {
            const one = placeIndividualSlot({
              durationMin: task.durationMin,
              requests: task.requests,
              currentFree,
              studentAvailable: availableByStudent[task.studentId] ?? [],
              canPlace: (day, start, end) =>
                !studentBusy(task.studentId, day, start, end) && !teacherBusy(day, start, end),
            });
            return one ? [one] : [];
          })();

    if (placedList.length === 0 || (parts > 1 && placedList.length < parts)) {
      unassigned.push({
        studentId: task.studentId,
        studentName: task.studentName,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        reason:
          parts > 1 && placedList.length > 0 && placedList.length < parts
            ? `no caben las ${parts} medias horas sin juntarlas (solo ${placedList.length})`
            : unassignedReason({
                teacherHasAvailability: availabilities.length > 0,
                studentAvailable: availableByStudent[task.studentId] ?? [],
              }),
      });
      return;
    }

    for (const placed of placedList) {
      plannedInserts.push({
        teacherId,
        subjectId: task.subjectId,
        studentId: task.studentId,
        dayOfWeek: placed.day,
        startHour: placed.start,
        endHour: placed.end,
        origin: "auto",
        prefOrder: placed.prefOrder,
      });
      assigned.push({
        studentId: task.studentId,
        studentName: task.studentName,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        day: placed.day,
        startHour: placed.start,
        endHour: placed.end,
        prefOrder: placed.prefOrder,
      });
      (placedByStudent[task.studentId] ??= []).push(placed);
      occupy(currentFree, placed.day, { start: placed.start, end: placed.end });
    }
  }

  for (const task of collectiveTasks) placeCollective(task);
  for (const task of individualTasks) placeIndividual(task);

  const targetIds = [...targetSubjectIds];
  if (targetIds.length > 0) {
    await conn.delete(schema.assignments).where(
      and(
        eq(schema.assignments.teacherId, teacherId),
        eq(schema.assignments.origin, "auto"),
        inArray(schema.assignments.subjectId, targetIds),
      ),
    );
  }

  if (plannedInserts.length > 0) {
    await conn.insert(schema.assignments).values(plannedInserts);
  }

  return { assigned, unassigned, skipped: skipped.length > 0 ? skipped : undefined };
}
