import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import { durationMinError, sessionPartsFitDuration, SESSION_PART_MIN } from "@/lib/hours";
import {
  requireTeacher,
  assertSubjectOwned,
  assertStudentAccessible,
  assertSubjectStudentOwned,
  getSubjectIdsForTeacher,
  assertScheduleEditable,
} from "@/lib/auth/requireTeacher";

function clampSessionParts(raw: unknown, fallback = 1): number {
  let sessionParts = Number(raw);
  if (!Number.isFinite(sessionParts) || sessionParts < 1) sessionParts = fallback;
  return Math.min(12, Math.floor(sessionParts));
}

function sessionPartsError(totalMin: number, sessionParts: number): string | null {
  if (sessionParts <= 1) return null;
  if (!sessionPartsFitDuration(totalMin, sessionParts)) {
    const max = Math.floor(totalMin / SESSION_PART_MIN);
    return `Con ${totalMin} min debes dividir en exactamente ${max} partes de ${SESSION_PART_MIN} min (o no dividir)`;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const studentId = searchParams.get("studentId");

  const subjectIds = await getSubjectIdsForTeacher(auth.teacher.id);
  if (subjectIds.length === 0) return Response.json([]);

  const conditions = [inArray(schema.subjectStudents.subjectId, subjectIds)];

  if (subjectId) {
    const sid = Number(subjectId);
    const denied = await assertSubjectOwned(sid, auth.teacher.id);
    if (denied) return denied;
    conditions.push(eq(schema.subjectStudents.subjectId, sid));
  }
  if (studentId) {
    const stid = Number(studentId);
    const denied = await assertStudentAccessible(stid, auth.teacher.id);
    if (denied) return denied;
    conditions.push(eq(schema.subjectStudents.studentId, stid));
  }

  const rows = await db.query.subjectStudents.findMany({
    where: and(...conditions),
    with: { student: true, subject: true },
    orderBy: (ss, { asc }) => [asc(ss.priority), asc(ss.id)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const subjectId = Number(body.subjectId);
  const studentId = Number(body.studentId);
  if (!subjectId || !studentId) return apiError("subjectId y studentId requeridos");

  const subjectDenied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (subjectDenied) return subjectDenied;

  const studentDenied = await assertStudentAccessible(studentId, auth.teacher.id);
  if (studentDenied) return studentDenied;

  const student = await db.query.students.findFirst({ where: eq(schema.students.id, studentId) });
  if (!student) return apiError("Alumno no encontrado", 404);

  const exists = await db.query.subjectStudents.findFirst({
    where: and(eq(schema.subjectStudents.subjectId, subjectId), eq(schema.subjectStudents.studentId, studentId)),
  });
  if (exists) return apiError("El alumno ya está en la asignatura", 409);

  let durationMin = body.durationMin != null ? Number(body.durationMin) : null;
  let slotsRequired = Number(body.slotsRequired ?? 1);
  const sessionPartsProvided = body.sessionParts != null;
  let sessionParts = sessionPartsProvided ? clampSessionParts(body.sessionParts) : 1;

  // Si no se indica duración, aplicar regla del curso del alumno (si existe).
  if (student.grade) {
    const gradeRule = await db.query.subjectGradeDurations.findFirst({
      where: and(
        eq(schema.subjectGradeDurations.subjectId, subjectId),
        eq(schema.subjectGradeDurations.grade, student.grade.trim()),
      ),
    });
    if (gradeRule) {
      if (durationMin == null) durationMin = gradeRule.durationMin;
      if (body.slotsRequired == null) slotsRequired = gradeRule.slotsRequired;
      if (!sessionPartsProvided) sessionParts = Math.max(1, gradeRule.sessionParts ?? 1);
    }
  }

  if (durationMin != null) {
    const dErr = durationMinError(durationMin);
    if (dErr) return apiError(dErr);
  }

  const total =
    durationMin ??
    (
      await db.query.subjects.findFirst({ where: eq(schema.subjects.id, subjectId) })
    )?.defaultDurationMin ??
    60;
  const partsErr = sessionPartsError(total, sessionParts);
  if (partsErr) return apiError(partsErr);

  let priority = body.priority != null ? Number(body.priority) : null;
  if (priority == null) {
    const siblings = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, subjectId),
    });
    const maxP = siblings.reduce((m, x) => Math.max(m, x.priority), 0);
    priority = maxP + 1;
    if (siblings.length === 0) priority = 1;
  }
  const [created] = await db.insert(schema.subjectStudents).values({
    subjectId,
    studentId,
    durationMin,
    priority,
    slotsRequired,
    sessionParts,
  }).returning();
  return Response.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");

  const owned = await assertSubjectStudentOwned(id, auth.teacher.id);
  if (owned) return owned;

  if (body.dir === "up" || body.dir === "down") {
    const dir = String(body.dir);
    const row = await db.query.subjectStudents.findFirst({ where: eq(schema.subjectStudents.id, id) });
    if (!row) return apiError("No encontrado", 404);
    const siblings = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, row.subjectId),
      orderBy: (ss, { asc }) => [asc(ss.priority), asc(ss.id)],
    });
    const idx = siblings.findIndex((s) => s.id === id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return Response.json({ ok: true });
    const neighbor = siblings[swapIdx];
    await db.update(schema.subjectStudents).set({ priority: neighbor.priority }).where(eq(schema.subjectStudents.id, row.id));
    await db.update(schema.subjectStudents).set({ priority: row.priority }).where(eq(schema.subjectStudents.id, neighbor.id));
    return Response.json({ ok: true });
  }

  if (body.to !== undefined) {
    const row = await db.query.subjectStudents.findFirst({ where: eq(schema.subjectStudents.id, id) });
    if (!row) return apiError("No encontrado", 404);
    const siblings = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, row.subjectId),
      orderBy: (ss, { asc }) => [asc(ss.priority), asc(ss.id)],
    });
    const idx = siblings.findIndex((x) => x.id === id);
    const dest = Math.min(Math.max(1, Number(body.to)), siblings.length);
    if (dest === idx + 1) return Response.json({ ok: true });
    const [moved] = siblings.splice(idx, 1);
    siblings.splice(dest - 1, 0, moved);
    for (let i = 0; i < siblings.length; i++) {
      if (siblings[i].priority !== i + 1) {
        await db.update(schema.subjectStudents).set({ priority: i + 1 }).where(eq(schema.subjectStudents.id, siblings[i].id));
      }
    }
    return Response.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (body.durationMin !== undefined) {
    if (body.durationMin == null || body.durationMin === "") {
      patch.durationMin = null;
    } else {
      const durationMin = Number(body.durationMin);
      const dErr = durationMinError(durationMin);
      if (dErr) return apiError(dErr);
      patch.durationMin = durationMin;
    }
  }
  if (body.slotsRequired !== undefined) patch.slotsRequired = Number(body.slotsRequired);
  if (body.sessionParts !== undefined) {
    patch.sessionParts = clampSessionParts(body.sessionParts);
  }

  if (body.priority !== undefined) {
    const newP = Number(body.priority);
    const row = await db.query.subjectStudents.findFirst({ where: eq(schema.subjectStudents.id, id) });
    if (!row) return apiError("No encontrado", 404);
    const siblings = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, row.subjectId),
      orderBy: (ss, { asc }) => [asc(ss.priority), asc(ss.id)],
    });
    const others = siblings.filter((x) => x.id !== id);
    const clamped = Math.min(Math.max(1, newP), others.length + 1);
    others.splice(clamped - 1, 0, { ...row, priority: clamped });
    for (let i = 0; i < others.length; i++) {
      if (others[i].priority !== i + 1) {
        await db.update(schema.subjectStudents).set({ priority: i + 1 }).where(eq(schema.subjectStudents.id, others[i].id));
      }
    }
    return Response.json({ ok: true });
  }

  if (patch.durationMin !== undefined || patch.sessionParts !== undefined) {
    const row = await db.query.subjectStudents.findFirst({ where: eq(schema.subjectStudents.id, id) });
    if (!row) return apiError("No encontrado", 404);
    const subject = await db.query.subjects.findFirst({ where: eq(schema.subjects.id, row.subjectId) });
    const nextDuration =
      patch.durationMin !== undefined ? (patch.durationMin as number | null) : row.durationMin;
    const total = nextDuration ?? subject?.defaultDurationMin ?? 60;
    const nextParts =
      patch.sessionParts !== undefined ? (patch.sessionParts as number) : Math.max(1, row.sessionParts ?? 1);
    const partsErr = sessionPartsError(total, nextParts);
    if (partsErr) return apiError(partsErr);
  }

  const [updated] = await db.update(schema.subjectStudents).set(patch).where(eq(schema.subjectStudents.id, id)).returning();
  if (!updated) return apiError("No encontrado", 404);
  return Response.json(updated);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");

  const denied = await assertSubjectStudentOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.subjectStudents).where(eq(schema.subjectStudents.id, id));
  return Response.json({ ok: true });
}
