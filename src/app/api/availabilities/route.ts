import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import {
  requireTeacher,
  assertOwnTeacher,
  assertAvailabilityOwned,
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

  const rows = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, teacherId),
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
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
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!teacherId) return apiError("teacherId requerido");

  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  const [created] = await db.insert(schema.availabilities).values({ teacherId, dayOfWeek, startHour, endHour }).returning();
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
  const denied = await assertAvailabilityOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.availabilities).where(eq(schema.availabilities.id, id));
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
  const denied = await assertAvailabilityOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.availabilities.findFirst({ where: eq(schema.availabilities.id, id) });
  if (!row) return apiError("No encontrada", 404);
  const dayOfWeek = body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : row.dayOfWeek;
  const startHour = body.startHour !== undefined ? Number(body.startHour) : row.startHour;
  const endHour = body.endHour !== undefined ? Number(body.endHour) : row.endHour;
  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  const [updated] = await db
    .update(schema.availabilities)
    .set({ dayOfWeek, startHour, endHour })
    .where(eq(schema.availabilities.id, id))
    .returning();
  return Response.json(updated);
}
