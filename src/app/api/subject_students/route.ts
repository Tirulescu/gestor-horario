import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import {
  requireTeacher,
  assertSubjectOwned,
  assertStudentAccessible,
  assertStudentLinkable,
  assertSubjectStudentOwned,
  getSubjectIdsForTeacher,
  linkStudentToTeacher,
} from "@/lib/auth/requireTeacher";

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId");
  const studentId = searchParams.get("studentId");

  const subjectIds = await getSubjectIdsForTeacher(auth.teacher.id);
  if (subjectIds.length === 0) return Response.json([]);

  let rows = await db.query.subjectStudents.findMany({
    where: inArray(schema.subjectStudents.subjectId, subjectIds),
    with: { student: true, subject: true },
    orderBy: (ss, { asc }) => [asc(ss.priority), asc(ss.id)],
  });

  if (subjectId) {
    const sid = Number(subjectId);
    const denied = await assertSubjectOwned(sid, auth.teacher.id);
    if (denied) return denied;
    rows = rows.filter((r) => r.subjectId === sid);
  }
  if (studentId) {
    const stid = Number(studentId);
    const denied = await assertStudentAccessible(stid, auth.teacher.id);
    if (denied) return denied;
    rows = rows.filter((r) => r.studentId === stid);
  }
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await safeJson(req);
  const subjectId = Number(body.subjectId);
  const studentId = Number(body.studentId);
  if (!subjectId || !studentId) return apiError("subjectId y studentId requeridos");

  const subjectDenied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (subjectDenied) return subjectDenied;

  const linkDenied = await assertStudentLinkable(studentId, auth.teacher.id);
  if (linkDenied) return linkDenied;
  await linkStudentToTeacher(auth.teacher.id, studentId);

  const exists = await db.query.subjectStudents.findFirst({
    where: and(eq(schema.subjectStudents.subjectId, subjectId), eq(schema.subjectStudents.studentId, studentId)),
  });
  if (exists) return apiError("El alumno ya está en la asignatura", 409);

  const durationMin = body.durationMin != null ? Number(body.durationMin) : null;
  const slotsRequired = Number(body.slotsRequired ?? 1);
  let priority = body.priority != null ? Number(body.priority) : null;
  if (priority == null) {
    const siblings = await db.query.subjectStudents.findMany({
      where: eq(schema.subjectStudents.subjectId, subjectId),
    });
    const maxP = siblings.reduce((m, x) => Math.max(m, x.priority), 0);
    priority = maxP + 1;
    if (siblings.length === 0) priority = 1;
  }
  const [created] = await db.insert(schema.subjectStudents).values({ subjectId, studentId, durationMin, priority, slotsRequired }).returning();
  return Response.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

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
  if (body.durationMin !== undefined) patch.durationMin = body.durationMin == null ? null : Number(body.durationMin);
  if (body.slotsRequired !== undefined) patch.slotsRequired = Number(body.slotsRequired);

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

  const [updated] = await db.update(schema.subjectStudents).set(patch).where(eq(schema.subjectStudents.id, id)).returning();
  if (!updated) return apiError("No encontrado", 404);
  return Response.json(updated);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");

  const denied = await assertSubjectStudentOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.subjectStudents).where(eq(schema.subjectStudents.id, id));
  return Response.json({ ok: true });
}
