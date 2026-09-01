import { randomUUID } from "crypto";
import { normalizeRanges, slotWithinAvailable, freeWithinStudentAvailability } from "@/lib/studentAvailability";
import {
  findBestCollectiveSlot,
  prefScoreForSlot,
  type CollectiveMember,
} from "@/lib/collectiveSchedule";
import { endHourFromDuration, slotStartsForDuration } from "@/lib/hours";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";

export interface AutoScheduleAssigned {
  studentId: number;
  studentName: string;
  subjectId: number;
  subjectName: string;
  day: number;
  startHour: number;
  endHour: number;
  /** opcion interna del alumno cumplida: 1 = su favorita, null = no peticion, 0 = fallback */
  prefOrder: number | null;
  isCollective?: boolean;
  collectiveSessionId?: string | null;
}
export interface AutoScheduleUnassigned {
  studentId: number;
  studentName: string;
  subjectId: number;
  subjectName: string;
  reason: string;
}
export interface AutoScheduleResult {
  assigned: AutoScheduleAssigned[];
  unassigned: AutoScheduleUnassigned[];
  skipped?: { subjectId: number; subjectName: string; reason: string }[];
}

export interface AutoScheduleOptions {
  /** Si se indica, solo se auto-agendan estas asignaturas (deben no estar fijadas). */
  subjectIds?: number[];
}

interface Interval { start: number; end: number; }

function subtract(a: Interval, b: Interval): Interval[] {
  if (b.start >= a.end || b.end <= a.start) return [a];
  const res: Interval[] = [];
  if (b.start > a.start) res.push({ start: a.start, end: b.start });
  if (b.end < a.end) res.push({ start: b.end, end: a.end });
  return res;
}

function splitFree(free: Interval[], taken: Interval): Interval[] {
  const res: Interval[] = [];
  for (const f of free) res.push(...subtract(f, taken));
  return res;
}

function findFirstSlot(
  freeByDay: Record<number, Interval[]>,
  durationMin: number,
  canPlace: (day: number, start: number, end: number) => boolean,
): { day: number; start: number; end: number } | null {
  for (const dStr of Object.keys(freeByDay).sort((a, b) => Number(a) - Number(b))) {
    const day = Number(dStr);
    for (const f of freeByDay[day] ?? []) {
      for (const start of slotStartsForDuration(f, durationMin)) {
        const end = endHourFromDuration(start, durationMin);
        if (canPlace(day, start, end)) return { day, start, end };
      }
    }
  }
  return null;
}

interface Task {
  subjectId: number;
  subjectName: string;
  subjectOrder: number;
  studentId: number;
  studentName: string;
  priority: number;
  durationMin: number;
  slotsRequired: number;
  requests: { dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[];
}

interface CollectiveSubjectTask {
  subjectId: number;
  subjectName: string;
  subjectOrder: number;
  durationMin: number;
  members: CollectiveMember[];
}

export async function autoScheduleByTeacher(
  teacherId: number,
  options: AutoScheduleOptions = {},
): Promise<AutoScheduleResult> {
  const teacher = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, teacherId) });
  if (!teacher) throw new Error("Profesor no encontrado");

  const allSubjects = await db.query.subjects.findMany({
    where: eq(schema.subjects.teacherId, teacherId),
    orderBy: (s, { asc }) => [asc(s.id)],
  });
  if (allSubjects.length === 0) {
    return { assigned: [], unassigned: [] };
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

  const allSS: (typeof schema.subjectStudents.$inferSelect & { student?: { id: number; name: string } })[] = [];
  for (const sid of subjectIds) {
    const rows = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, sid),
      with: { student: true },
    });
    allSS.push(...rows);
  }

  const allReq: { subjectId: number; studentId: number; dayOfWeek: number; startHour: number; endHour: number; prefOrder: number }[] = [];
  for (const sid of subjectIds) {
    const rows = await db.query.slotRequests.findMany({
      where: eq(schema.slotRequests.subjectId, sid),
    });
    for (const r of rows) {
      allReq.push({ subjectId: sid, studentId: r.studentId, dayOfWeek: r.dayOfWeek, startHour: r.startHour, endHour: r.endHour, prefOrder: r.prefOrder ?? r.id });
    }
  }

  const individualTasks: Task[] = [];
  const collectiveTasks: CollectiveSubjectTask[] = [];

  const allStudentIds = Array.from(new Set(allSS.map((m) => m.studentId)));

  const blockedByStudent: Record<number, Record<number, { start: number; end: number }[]>> = {};
  const availableByStudent: Record<number, { day: number; start: number; end: number }[]> = {};
  if (allStudentIds.length > 0) {
    const srows = await db.query.students.findMany({ where: inArray(schema.students.id, allStudentIds) });
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
          subjectOrder: subjectIds.indexOf(s.id),
          durationMin: s.defaultDurationMin,
          members,
        });
      }
      continue;
    }

    for (const m of ss) {
      const durationMin = m.durationMin ?? s.defaultDurationMin;
      const reqs = allReq
        .filter((r) => r.subjectId === s.id && r.studentId === m.studentId)
        .map((r) => ({ dayOfWeek: r.dayOfWeek, startHour: r.startHour, endHour: r.endHour, prefOrder: r.prefOrder }))
        .sort((x, y) => x.prefOrder - y.prefOrder);
      individualTasks.push({
        subjectId: s.id,
        subjectName: s.name,
        subjectOrder: subjectIds.indexOf(s.id),
        studentId: m.studentId,
        studentName: m.student?.name ?? `alumno ${m.studentId}`,
        priority: m.priority,
        durationMin,
        slotsRequired: m.slotsRequired ?? 1,
        requests: reqs,
      });
    }
  }

  const blockedHere = (studentId: number, day: number, start: number, end: number) =>
    ((blockedByStudent[studentId] ?? {})[day] ?? []).some((b) => b.end > start && b.start < end);
  const withinAvailable = (studentId: number, day: number, start: number, end: number) =>
    slotWithinAvailable(day, start, end, availableByStudent[studentId] ?? []);

  individualTasks.sort((a, b) =>
    a.priority - b.priority || a.subjectOrder - b.subjectOrder || a.studentName.localeCompare(b.studentName),
  );
  collectiveTasks.sort((a, b) => a.subjectOrder - b.subjectOrder);

  const availabilities = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, teacherId),
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
  });

  const freeByDay: Record<number, Interval[]> = {};
  for (const a of availabilities) {
    freeByDay[a.dayOfWeek] = freeByDay[a.dayOfWeek] ?? [];
    freeByDay[a.dayOfWeek].push({ start: a.startHour, end: a.endHour });
  }
  for (const dStr of Object.keys(freeByDay)) {
    freeByDay[Number(dStr)].sort((x, y) => x.start - y.start);
  }

  const currentFree: Record<number, Interval[]> = {};
  for (const dStr of Object.keys(freeByDay)) {
    const d = Number(dStr);
    currentFree[d] = freeByDay[d].map((i) => ({ ...i }));
  }

  const allAssignments = await db.query.assignments.findMany({
    where: eq(schema.assignments.teacherId, teacherId),
  });

  const placedByStudent: Record<number, { day: number; start: number; end: number }[]> = {};
  for (const a of allAssignments) {
    const isBeingRescheduled = targetSubjectIds.has(a.subjectId) && a.origin === "auto";
    if (isBeingRescheduled) continue;
    (placedByStudent[a.studentId] ??= []).push({
      day: a.dayOfWeek,
      start: a.startHour,
      end: a.endHour,
    });
    if (!currentFree[a.dayOfWeek]) continue;
    currentFree[a.dayOfWeek] = splitFree(currentFree[a.dayOfWeek], { start: a.startHour, end: a.endHour });
  }

  const tBlocks = await db.query.teacherBlocks.findMany({
    where: eq(schema.teacherBlocks.teacherId, teacherId),
  });
  for (const b of tBlocks) {
    if (!currentFree[b.dayOfWeek]) continue;
    currentFree[b.dayOfWeek] = splitFree(currentFree[b.dayOfWeek], { start: b.startHour, end: b.endHour });
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

  // --- Asignaturas colectivas: una sesión con el máximo de alumnos posible ---
  for (const cTask of collectiveTasks) {
    const { slot, fitting, totalMembers } = findBestCollectiveSlot(
      cTask.members,
      cTask.durationMin,
      currentFree,
      (studentId, day, start, end) => !studentBusy(studentId, day, start, end),
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
        const metPref = pref < 100 ? pref : 0;
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
          prefOrder: metPref < 100 ? metPref : null,
          isCollective: true,
          collectiveSessionId: sessionId,
        });
        (placedByStudent[m.studentId] ??= []).push(slot);
      }
      currentFree[slot.day] = splitFree(currentFree[slot.day], { start: slot.start, end: slot.end });

      const notFitting = cTask.members.filter((m) => !fitting.some((f) => f.studentId === m.studentId));
      for (const m of notFitting) {
        unassigned.push({
          studentId: m.studentId,
          studentName: m.studentName,
          subjectId: cTask.subjectId,
          subjectName: cTask.subjectName,
          reason: fitting.length > 0
            ? `no disponible en el horario colectivo elegido (${fitting.length}/${totalMembers} alumnos en la sesión)`
            : availabilities.length === 0
              ? "sin disponibilidad del profesor"
              : "sin hueco colectivo que encaje",
        });
      }
    } else {
      for (const m of cTask.members) {
        unassigned.push({
          studentId: m.studentId,
          studentName: m.studentName,
          subjectId: cTask.subjectId,
          subjectName: cTask.subjectName,
          reason: availabilities.length === 0 ? "sin disponibilidad del profesor" : "sin hueco colectivo que encaje",
        });
      }
    }
  }

  // --- Asignaturas individuales ---
  const workQueue: Task[] = [];
  for (const task of individualTasks) {
    const slots = Math.max(1, task.slotsRequired);
    for (let i = 0; i < slots; i++) workQueue.push(task);
  }

  for (const task of workQueue) {
    let placed: { day: number; start: number; end: number } | null = null;
    let metPref: number | null = null;

    for (const req of task.requests) {
      if (!currentFree[req.dayOfWeek]) continue;
      for (const f of currentFree[req.dayOfWeek]) {
        const interStart = Math.max(f.start, req.startHour);
        const interEnd = Math.min(f.end, req.endHour);
        const slotEnd = endHourFromDuration(interStart, task.durationMin);
        if (slotEnd <= interEnd + 1e-9 && slotEnd <= f.end + 1e-9) {
          const start = Math.round(interStart * 2) / 2;
          const end = endHourFromDuration(start, task.durationMin);
          if (studentBusy(task.studentId, req.dayOfWeek, start, end)) continue;
          placed = { day: req.dayOfWeek, start, end };
          metPref = req.prefOrder;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      const availFree = freeWithinStudentAvailability(currentFree, availableByStudent[task.studentId] ?? []);
      if (Object.keys(availFree).length > 0) {
        placed = findFirstSlot(
          availFree,
          task.durationMin,
          (day, start, end) => !studentBusy(task.studentId, day, start, end),
        );
        if (placed) metPref = 0;
      }
    }

    if (!placed) {
      placed = findFirstSlot(
        currentFree,
        task.durationMin,
        (day, start, end) => !studentBusy(task.studentId, day, start, end),
      );
      if (placed) metPref = 0;
    }

    if (placed) {
      plannedInserts.push({
        teacherId,
        subjectId: task.subjectId,
        studentId: task.studentId,
        dayOfWeek: placed.day,
        startHour: placed.start,
        endHour: placed.end,
        origin: "auto",
        prefOrder: metPref,
      });
      assigned.push({
        studentId: task.studentId,
        studentName: task.studentName,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        day: placed.day,
        startHour: placed.start,
        endHour: placed.end,
        prefOrder: metPref,
      });
      (placedByStudent[task.studentId] ??= []).push(placed);
      currentFree[placed.day] = splitFree(currentFree[placed.day], { start: placed.start, end: placed.end });
    } else {
      unassigned.push({
        studentId: task.studentId,
        studentName: task.studentName,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        reason: availabilities.length === 0 ? "sin disponibilidad del profesor" : "sin hueco libre que encaje",
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.assignments)
      .where(
        and(
          eq(schema.assignments.teacherId, teacherId),
          eq(schema.assignments.origin, "auto"),
          inArray(schema.assignments.subjectId, [...targetSubjectIds]),
        ),
      );
    if (plannedInserts.length > 0) {
      await tx.insert(schema.assignments).values(plannedInserts);
    }
  });

  return { assigned, unassigned, skipped: skipped.length > 0 ? skipped : undefined };
}
