import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import {
  requireTeacher,
  assertOwnTeacher,
  assertTeacherBlockOwned,
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

  const body = await safeJson(req);
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const dayOfWeek = Number(body.dayOfWeek);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);
  const title = String(body.title ?? "").trim() || "Bloqueado";
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!teacherId) return apiError("teacherId requerido");

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

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");
  const denied = await assertTeacherBlockOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.teacherBlocks).where(eq(schema.teacherBlocks.id, id));
  return Response.json({ ok: true });
}
