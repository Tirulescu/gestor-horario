import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import { normalizeRanges, validateSlotRequest } from "@/lib/studentAvailability";
import { resolveMemberDurationMin, slotFitsMaxDuration } from "@/lib/hours";
import {
  requireTeacher,
  assertSubjectOwned,
  assertStudentAccessible,
  assertSlotRequestOwned,
  getSubjectIdsForTeacher,
  assertScheduleEditable,
} from "@/lib/auth/requireTeacher";

async function getRequiredDurationMin(subjectId: number, studentId: number): Promise<number | null> {
  const subject = await db.query.subjects.findFirst({ where: eq(schema.subjects.id, subjectId) });
  if (!subject) return null;
  const member = await db.query.subjectStudents.findFirst({
    where: and(
      eq(schema.subjectStudents.subjectId, subjectId),
      eq(schema.subjectStudents.studentId, studentId),
    ),
  });
  return resolveMemberDurationMin(subject, member);
}

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const studentId = searchParams.get("studentId");

  const subjectIds = await getSubjectIdsForTeacher(auth.teacher.id);
  if (subjectIds.length === 0) return Response.json([]);

  const conditions = [inArray(schema.slotRequests.subjectId, subjectIds)];

  if (subjectId) {
    const sid = Number(subjectId);
    const denied = await assertSubjectOwned(sid, auth.teacher.id);
    if (denied) return denied;
    conditions.push(eq(schema.slotRequests.subjectId, sid));
  }
  if (studentId) {
    const stid = Number(studentId);
    const denied = await assertStudentAccessible(stid, auth.teacher.id);
    if (denied) return denied;
    conditions.push(eq(schema.slotRequests.studentId, stid));
  }

  const rows = await db.query.slotRequests.findMany({
    where: and(...conditions),
    with: { subject: true },
    orderBy: (s, { asc }) => [asc(s.id)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const studentId = Number(body.studentId);
  const subjectId = Number(body.subjectId);
  const dayOfWeek = Number(body.dayOfWeek);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);
  const status = body.status ? String(body.status) : "pending";
  if (!studentId || !subjectId) return apiError("studentId y subjectId requeridos");

  const subjectDenied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (subjectDenied) return subjectDenied;
  const studentDenied = await assertStudentAccessible(studentId, auth.teacher.id);
  if (studentDenied) return studentDenied;

  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);

  const requiredDurationMin = await getRequiredDurationMin(subjectId, studentId);
  if (requiredDurationMin != null && !slotFitsMaxDuration(startHour, endHour, requiredDurationMin)) {
    return apiError(`La franja no puede superar ${requiredDurationMin} min (puedes dividirla en varias solicitudes)`);
  }

  let prefOrder = Number(body.prefOrder);
  if (!prefOrder || prefOrder < 1) {
    const existing = await db.query.slotRequests.findMany({
      where: and(eq(schema.slotRequests.studentId, studentId), eq(schema.slotRequests.subjectId, subjectId)),
    });
    prefOrder = existing.length + 1;
  }
  const student = await db.query.students.findFirst({ where: eq(schema.students.id, studentId) });
  const teacherAvails = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, auth.teacher.id),
  });
  if (student) {
    const available = normalizeRanges(student.availableRanges);
    const blocked = normalizeRanges(student.blockedRanges);
    const slotErr = validateSlotRequest({
      day: dayOfWeek,
      start: startHour,
      end: endHour,
      teacherAvails,
      studentAvailable: available,
      studentBlocked: blocked,
      requiredDurationMin: requiredDurationMin ?? undefined,
    });
    if (slotErr) return apiError(slotErr);
  }
  const [created] = await db.insert(schema.slotRequests).values({ studentId, subjectId, dayOfWeek, startHour, endHour, prefOrder, status }).returning();
  return Response.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");
  const denied = await assertSlotRequestOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.slotRequests).where(eq(schema.slotRequests.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");
  const denied = await assertSlotRequestOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.slotRequests.findFirst({ where: eq(schema.slotRequests.id, id) });
  if (!row) return apiError("No encontrada", 404);
  const dayOfWeek = body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : row.dayOfWeek;
  const startHour = body.startHour !== undefined ? Number(body.startHour) : row.startHour;
  const endHour = body.endHour !== undefined ? Number(body.endHour) : row.endHour;
  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);

  const requiredDurationMin = await getRequiredDurationMin(row.subjectId, row.studentId);
  if (requiredDurationMin != null && !slotFitsMaxDuration(startHour, endHour, requiredDurationMin)) {
    return apiError(`La franja no puede superar ${requiredDurationMin} min (puedes dividirla en varias solicitudes)`);
  }

  const student = await db.query.students.findFirst({ where: eq(schema.students.id, row.studentId) });
  const teacherAvails = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, auth.teacher.id),
  });
  if (student) {
    const slotErr = validateSlotRequest({
      day: dayOfWeek,
      start: startHour,
      end: endHour,
      teacherAvails,
      studentAvailable: normalizeRanges(student.availableRanges),
      studentBlocked: normalizeRanges(student.blockedRanges),
      requiredDurationMin: requiredDurationMin ?? undefined,
    });
    if (slotErr) return apiError(slotErr);
  }

  const [updated] = await db.update(schema.slotRequests).set({ dayOfWeek, startHour, endHour }).where(eq(schema.slotRequests.id, id)).returning();
  return Response.json(updated);
}

export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const id = Number(body.id);
  const dir = body.dir !== undefined ? String(body.dir) : undefined;
  const to = body.to !== undefined ? Number(body.to) : undefined;
  if (!id) return apiError("id requerido");
  if (dir === undefined && to === undefined) return apiError("dir (up|down) o to requerido");

  const denied = await assertSlotRequestOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.slotRequests.findFirst({ where: eq(schema.slotRequests.id, id) });
  if (!row) return apiError("No encontrada", 404);
  const siblings = await db.query.slotRequests.findMany({
    where: and(eq(schema.slotRequests.studentId, row.studentId), eq(schema.slotRequests.subjectId, row.subjectId)),
    orderBy: (s, { asc }) => [asc(s.prefOrder), asc(s.id)],
  });

  if (dir !== undefined) {
    if (!["up", "down"].includes(dir)) return apiError("dir debe ser up o down");
    const idx = siblings.findIndex((s) => s.id === id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return Response.json({ ok: true });
    const neighbor = siblings[swapIdx];
    await db.update(schema.slotRequests).set({ prefOrder: neighbor.prefOrder }).where(eq(schema.slotRequests.id, row.id));
    await db.update(schema.slotRequests).set({ prefOrder: row.prefOrder }).where(eq(schema.slotRequests.id, neighbor.id));
    return Response.json({ ok: true });
  }

  const idx = siblings.findIndex((s) => s.id === id);
  const dest = Math.min(Math.max(1, to!), siblings.length);
  if (dest === idx + 1) return Response.json({ ok: true });
  const [moved] = siblings.splice(idx, 1);
  siblings.splice(dest - 1, 0, moved);
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].prefOrder !== i + 1) {
      await db.update(schema.slotRequests).set({ prefOrder: i + 1 }).where(eq(schema.slotRequests.id, siblings[i].id));
    }
  }
  return Response.json({ ok: true });
}
