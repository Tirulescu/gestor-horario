import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import {
  requireTeacher,
  assertOwnTeacher,
  assertStudentLinkable,
  linkStudentToTeacher,
} from "@/lib/auth/requireTeacher";

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const rows = await db.query.teacherStudents.findMany({
    where: eq(schema.teacherStudents.teacherId, auth.teacher.id),
    with: { student: true },
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await safeJson(req);
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const studentId = Number(body.studentId);
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!studentId) return apiError("studentId requerido");

  const linkDenied = await assertStudentLinkable(studentId, teacherId);
  if (linkDenied) return linkDenied;
  await linkStudentToTeacher(teacherId, studentId);
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const teacherId = Number(searchParams.get("teacherId") ?? auth.teacher.id);
  const studentId = Number(searchParams.get("studentId"));
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!studentId) return apiError("studentId requerido");

  await db.delete(schema.teacherStudents).where(and(eq(schema.teacherStudents.teacherId, teacherId), eq(schema.teacherStudents.studentId, studentId)));
  return Response.json({ ok: true });
}
