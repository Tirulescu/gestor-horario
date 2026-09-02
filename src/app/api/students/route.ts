import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import {
  carveAvailabilityAroundBlocked,
  normalizeBlockedRanges,
  normalizeRanges,
} from "@/lib/studentAvailability";
import {
  requireTeacher,
  assertOwnTeacher,
  assertStudentAccessible,
  getStudentIdsForTeacher,
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

  const studentIds = await getStudentIdsForTeacher(teacherId);
  if (studentIds.length === 0) return Response.json([]);

  const rows = await db.query.students.findMany({
    where: inArray(schema.students.id, studentIds),
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
  const email = body.email ? String(body.email) : null;
  const grade = body.grade != null && String(body.grade).trim() !== "" ? String(body.grade).trim() : null;
  const created = await db.transaction(async (tx) => {
    const [student] = await tx.insert(schema.students).values({ name, email, grade }).returning();
    await tx
      .insert(schema.teacherStudents)
      .values({ teacherId: auth.teacher.id, studentId: student.id });
    return student;
  });
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
  const denied = await assertStudentAccessible(id, auth.teacher.id);
  if (denied) return denied;

  const name = String(body.name ?? "").trim();
  if (!name) return apiError("Nombre requerido");
  const email = body.email ? String(body.email) : null;
  const grade = body.grade !== undefined
    ? (String(body.grade).trim() === "" ? null : String(body.grade).trim())
    : undefined;
  const patch: Record<string, unknown> = { name, email };
  if (grade !== undefined) patch.grade = grade;

  const current =
    body.blockedRanges !== undefined || body.availableRanges !== undefined
      ? await db.query.students.findFirst({
          where: eq(schema.students.id, id),
          columns: { blockedRanges: true, availableRanges: true },
        })
      : null;

  const blocked =
    body.blockedRanges !== undefined
      ? normalizeBlockedRanges(body.blockedRanges)
      : normalizeBlockedRanges(current?.blockedRanges);

  let available =
    body.availableRanges !== undefined
      ? normalizeRanges(body.availableRanges)
      : normalizeRanges(current?.availableRanges);

  // Disponibilidad y bloqueos no pueden solapar: se recorta la disponibilidad.
  if (body.blockedRanges !== undefined || body.availableRanges !== undefined) {
    available = carveAvailabilityAroundBlocked(available, blocked);
    if (body.blockedRanges !== undefined) patch.blockedRanges = blocked;
    if (body.availableRanges !== undefined || body.blockedRanges !== undefined) {
      patch.availableRanges = available;
    }
  }

  const [updated] = await db.update(schema.students).set(patch).where(eq(schema.students.id, id)).returning();
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
  const denied = await assertStudentAccessible(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.students).where(eq(schema.students.id, id));
  return Response.json({ ok: true });
}
