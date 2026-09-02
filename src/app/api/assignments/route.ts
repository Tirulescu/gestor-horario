import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import { validateAssignmentSlot } from "@/lib/scheduleConflicts";
import {
  requireTeacher,
  assertOwnTeacher,
  assertSubjectOwned,
  assertStudentAccessible,
  assertAssignmentOwned,
} from "@/lib/auth/requireTeacher";

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const teacherIdParam = searchParams.get("teacherId");
  const studentId = searchParams.get("studentId");

  const teacherId = teacherIdParam ? Number(teacherIdParam) : auth.teacher.id;
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const conditions = [eq(schema.assignments.teacherId, teacherId)];

  if (subjectId) {
    const sid = Number(subjectId);
    const subjectDenied = await assertSubjectOwned(sid, auth.teacher.id);
    if (subjectDenied) return subjectDenied;
    conditions.push(eq(schema.assignments.subjectId, sid));
  }
  if (studentId) {
    const stid = Number(studentId);
    const studentDenied = await assertStudentAccessible(stid, auth.teacher.id);
    if (studentDenied) return studentDenied;
    conditions.push(eq(schema.assignments.studentId, stid));
  }

  const rows = await db.query.assignments.findMany({
    where: and(...conditions),
    with: { student: true, subject: true },
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await safeJson(req);
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const subjectId = Number(body.subjectId);
  const studentId = Number(body.studentId);
  const dayOfWeek = Number(body.dayOfWeek);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);

  const deniedTeacher = assertOwnTeacher(auth.teacher, teacherId);
  if (deniedTeacher) return deniedTeacher;
  if (!teacherId || !subjectId || !studentId) return apiError("teacherId, subjectId y studentId requeridos");

  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);

  const subjectDenied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (subjectDenied) return subjectDenied;
  const studentDenied = await assertStudentAccessible(studentId, auth.teacher.id);
  if (studentDenied) return studentDenied;

  const subject = await db.query.subjects.findFirst({ where: eq(schema.subjects.id, subjectId) });
  if (!subject) return apiError("Asignatura no encontrada", 404);
  if (subject.teacherId !== teacherId) return apiError("La asignatura no pertenece al profesor", 400);

  const enrollment = await db.query.subjectStudents.findFirst({
    where: and(
      eq(schema.subjectStudents.subjectId, subjectId),
      eq(schema.subjectStudents.studentId, studentId),
    ),
  });
  if (!enrollment) return apiError("El alumno no está inscrito en esa asignatura", 400);

  const collectiveSessionId =
    body.collectiveSessionId != null && String(body.collectiveSessionId).trim() !== ""
      ? String(body.collectiveSessionId).trim()
      : null;

  const conflict = await validateAssignmentSlot({
    teacherId,
    studentIds: [studentId],
    dayOfWeek,
    startHour,
    endHour,
  });
  if (conflict) return apiError(conflict);

  const [created] = await db.insert(schema.assignments)
    .values({
      teacherId,
      subjectId,
      studentId,
      dayOfWeek,
      startHour,
      endHour,
      origin: "manual",
      collectiveSessionId,
    })
    .returning();
  return Response.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");
  const denied = await assertAssignmentOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, id) });
  if (!row) return apiError("No encontrada", 404);

  if (row.collectiveSessionId) {
    await db.delete(schema.assignments).where(
      and(
        eq(schema.assignments.teacherId, row.teacherId),
        eq(schema.assignments.collectiveSessionId, row.collectiveSessionId),
      ),
    );
  } else {
    await db.delete(schema.assignments).where(eq(schema.assignments.id, id));
  }
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");
  const denied = await assertAssignmentOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, id) });
  if (!row) return apiError("No encontrada", 404);
  const dayOfWeek = body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : row.dayOfWeek;
  const startHour = body.startHour !== undefined ? Number(body.startHour) : row.startHour;
  const endHour = body.endHour !== undefined ? Number(body.endHour) : row.endHour;
  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  if (endHour <= startHour) return apiError("La hora de fin debe ser posterior a la de inicio");

  if (row.collectiveSessionId) {
    const peers = await db.query.assignments.findMany({
      where: and(
        eq(schema.assignments.teacherId, row.teacherId),
        eq(schema.assignments.collectiveSessionId, row.collectiveSessionId),
      ),
      columns: { id: true, studentId: true },
    });
    const conflict = await validateAssignmentSlot({
      teacherId: row.teacherId,
      studentIds: peers.map((p) => p.studentId),
      dayOfWeek,
      startHour,
      endHour,
      excludeAssignmentIds: peers.map((p) => p.id),
      excludeCollectiveSessionId: row.collectiveSessionId,
    });
    if (conflict) return apiError(conflict);

    const updated = await db
      .update(schema.assignments)
      .set({ dayOfWeek, startHour, endHour })
      .where(
        and(
          eq(schema.assignments.teacherId, row.teacherId),
          eq(schema.assignments.collectiveSessionId, row.collectiveSessionId),
        ),
      )
      .returning();
    return Response.json(updated[0] ?? row);
  }

  const conflict = await validateAssignmentSlot({
    teacherId: row.teacherId,
    studentIds: [row.studentId],
    dayOfWeek,
    startHour,
    endHour,
    excludeAssignmentIds: [id],
  });
  if (conflict) return apiError(conflict);

  const [updated] = await db.update(schema.assignments).set({ dayOfWeek, startHour, endHour }).where(eq(schema.assignments.id, id)).returning();
  return Response.json(updated);
}
