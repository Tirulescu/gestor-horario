import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { and, eq, ne } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import {
  requireTeacher,
  assertOwnTeacher,
  assertTeacherBlockOwned,
  assertScheduleEditable,
} from "@/lib/auth/requireTeacher";

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const teacherIdParam = searchParams.get("teacherId");
  const teacherId = teacherIdParam ? Number(teacherIdParam) : auth.teacher.id;
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const rows = await db.query.teacherBlocks.findMany({
    where: eq(schema.teacherBlocks.teacherId, teacherId),
    orderBy: (b, { asc }) => [asc(b.dayOfWeek), asc(b.startHour)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const dayOfWeek = Number(body.dayOfWeek);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);
  const title = String(body.title ?? "").trim();
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!teacherId) return apiError("teacherId requerido");
  if (!title) return apiError("El motivo es obligatorio");

  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  const [created] = await db.insert(schema.teacherBlocks).values({ teacherId, title, dayOfWeek, startHour, endHour }).returning();
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
  const denied = await assertTeacherBlockOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.teacherBlocks).where(eq(schema.teacherBlocks.id, id));
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
  const denied = await assertTeacherBlockOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.teacherBlocks.findFirst({
    where: eq(schema.teacherBlocks.id, id),
  });
  if (!row) return apiError("No encontrado", 404);

  const title = body.title !== undefined ? String(body.title).trim() : row.title;
  const dayOfWeek = body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : row.dayOfWeek;
  const startHour = body.startHour !== undefined ? Number(body.startHour) : row.startHour;
  const endHour = body.endHour !== undefined ? Number(body.endHour) : row.endHour;
  if (!title) return apiError("El motivo es obligatorio");
  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  if (!(endHour > startHour)) return apiError("La hora de fin debe ser posterior a la de inicio");

  const otherBlocks = await db.query.teacherBlocks.findMany({
    where: and(eq(schema.teacherBlocks.teacherId, row.teacherId), ne(schema.teacherBlocks.id, id)),
    columns: { dayOfWeek: true, startHour: true, endHour: true },
  });
  if (otherBlocks.some((b) => b.dayOfWeek === dayOfWeek && endHour > b.startHour && startHour < b.endHour)) {
    return apiError("Ese horario ya está ocupado por otro bloqueo");
  }

  const asgs = await db.query.assignments.findMany({
    where: eq(schema.assignments.teacherId, row.teacherId),
    columns: { dayOfWeek: true, startHour: true, endHour: true },
  });
  if (asgs.some((a) => a.dayOfWeek === dayOfWeek && endHour > a.startHour && startHour < a.endHour)) {
    return apiError("Ese horario choca con una clase");
  }

  const [updated] = await db
    .update(schema.teacherBlocks)
    .set({ title, dayOfWeek, startHour, endHour })
    .where(eq(schema.teacherBlocks.id, id))
    .returning();
  return Response.json(updated);
}
