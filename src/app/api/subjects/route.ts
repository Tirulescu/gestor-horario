import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import { durationMinError } from "@/lib/hours";
import { normalizeSubjectColor, subjectColorError } from "@/lib/subjectColors";
import { requireTeacher, assertOwnTeacher, assertSubjectOwned, assertScheduleEditable } from "@/lib/auth/requireTeacher";

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const teacherIdParam = searchParams.get("teacherId");
  const teacherId = teacherIdParam ? Number(teacherIdParam) : auth.teacher.id;
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const rows = await db.query.subjects.findMany({
    where: eq(schema.subjects.teacherId, teacherId),
    with: { subjectStudents: true, subjectGradeDurations: true },
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
  const name = String(body.name ?? "").trim();
  if (!name) return apiError("Nombre requerido");
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const defaultDurationMin = Number(body.defaultDurationMin ?? 60);
  const dErr = durationMinError(defaultDurationMin);
  if (dErr) return apiError(dErr);
  const isCollective = Boolean(body.isCollective);
  if (body.color !== undefined) {
    const cErr = subjectColorError(body.color);
    if (cErr) return apiError(cErr);
  }
  const color = body.color !== undefined ? normalizeSubjectColor(body.color) : undefined;
  const [created] = await db.insert(schema.subjects).values({
    name,
    teacherId,
    defaultDurationMin,
    isCollective,
    ...(color !== undefined ? { color } : {}),
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
  const deniedSubject = await assertSubjectOwned(id, auth.teacher.id);
  if (deniedSubject) return deniedSubject;

  const name = String(body.name ?? "").trim();
  if (!name) return apiError("Nombre requerido");
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const deniedTeacher = assertOwnTeacher(auth.teacher, teacherId);
  if (deniedTeacher) return deniedTeacher;

  const defaultDurationMin = Number(body.defaultDurationMin ?? 60);
  const dErr = durationMinError(defaultDurationMin);
  if (dErr) return apiError(dErr);
  const isCollective = body.isCollective !== undefined ? Boolean(body.isCollective) : undefined;
  if (body.color !== undefined) {
    const cErr = subjectColorError(body.color);
    if (cErr) return apiError(cErr);
  }
  const color = body.color !== undefined ? normalizeSubjectColor(body.color) : undefined;
  const [updated] = await db
    .update(schema.subjects)
    .set({
      name,
      teacherId,
      defaultDurationMin,
      ...(isCollective !== undefined ? { isCollective } : {}),
      ...(color !== undefined ? { color } : {}),
    })
    .where(eq(schema.subjects.id, id))
    .returning();
  if (!updated) return apiError("No encontrado", 404);
  return Response.json(updated);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");
  const deniedSubject = await assertSubjectOwned(id, auth.teacher.id);
  if (deniedSubject) return deniedSubject;

  const patch: Partial<{ scheduleFixed: boolean; isCollective: boolean; color: string | null }> = {};
  if (body.scheduleFixed !== undefined) {
    patch.scheduleFixed = Boolean(body.scheduleFixed);
  }
  if (body.isCollective !== undefined) patch.isCollective = Boolean(body.isCollective);
  if (body.color !== undefined) {
    const cErr = subjectColorError(body.color);
    if (cErr) return apiError(cErr);
    patch.color = normalizeSubjectColor(body.color);
  }
  if (Object.keys(patch).length === 0) return apiError("Nada que actualizar");

  const [updated] = await db
    .update(schema.subjects)
    .set(patch)
    .where(eq(schema.subjects.id, id))
    .returning();
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
  const denied = await assertSubjectOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.subjects).where(eq(schema.subjects.id, id));
  return Response.json({ ok: true });
}
