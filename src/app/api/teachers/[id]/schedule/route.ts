import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/validate";
import { requireTeacher, assertOwnTeacher } from "@/lib/auth/requireTeacher";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const teacherId = Number(id);
  if (!teacherId) return apiError("id inválido");
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const assignments = await db.query.assignments.findMany({
    where: eq(schema.assignments.teacherId, teacherId),
    with: { student: true, subject: true },
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
  });

  const result = assignments.map((a) => ({
    id: a.id,
    dayOfWeek: a.dayOfWeek,
    startHour: a.startHour,
    endHour: a.endHour,
    origin: a.origin,
    subjectId: a.subjectId,
    subjectName: a.subject?.name ?? `#${a.subjectId}`,
    studentId: a.studentId,
    studentName: a.student?.name ?? `#${a.studentId}`,
  }));
  return NextResponse.json(result);
}
