import { NextRequest } from "next/server";
import { autoScheduleByTeacher } from "@/lib/autoSchedule";
import { withTeacherScheduleLock } from "@/lib/autoScheduleLock";
import { apiError } from "@/lib/validate";
import { requireTeacher, assertOwnTeacher, assertSubjectOwned } from "@/lib/auth/requireTeacher";

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

  if (!subjectIds?.length && auth.teacher.scheduleFixed) {
    return apiError("Horario global fijado — auto-agenda asignaturas concretas o desactiva «Fijar horario» en tu perfil", 403);
  }

  if (subjectIds?.length) {
    for (const sid of subjectIds) {
      const deniedSubject = await assertSubjectOwned(sid, auth.teacher.id);
      if (deniedSubject) return deniedSubject;
    }
  }

  try {
    const result = await withTeacherScheduleLock(teacherId, () =>
      autoScheduleByTeacher(teacherId, { subjectIds }),
    );
    return Response.json(result);
  } catch (e) {
    return apiError((e as Error).message, 500);
  }
}
