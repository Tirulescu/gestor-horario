import { NextRequest } from "next/server";
import { autoScheduleByTeacher } from "@/lib/autoSchedule";
import { withTeacherScheduleLock } from "@/lib/autoScheduleLock";
import { apiError } from "@/lib/validate";
import { requireTeacher, assertOwnTeacher, forbid } from "@/lib/auth/requireTeacher";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!teacherId) return apiError("teacherId requerido");

  const subjectIds: number[] | undefined = Array.isArray(body.subjectIds)
    ? body.subjectIds.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
    : undefined;

  if (auth.teacher.scheduleFixed) {
    return apiError("Horario fijado — desactiva «Fijar horario» en tu perfil para usar el auto-agendado", 403);
  }

  if (subjectIds?.length) {
    const owned = await db.query.subjects.findMany({
      where: and(
        eq(schema.subjects.teacherId, auth.teacher.id),
        inArray(schema.subjects.id, subjectIds),
      ),
      columns: { id: true },
    });
    if (owned.length !== subjectIds.length) return forbid();
  }

  try {
    const result = await withTeacherScheduleLock(teacherId, (tx) =>
      autoScheduleByTeacher(teacherId, { subjectIds }, tx),
    );
    return Response.json(result);
  } catch (e) {
    return apiError((e as Error).message, 500);
  }
}
