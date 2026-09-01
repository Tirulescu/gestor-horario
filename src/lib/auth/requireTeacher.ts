import { createClient } from "@/lib/supabase/server";
import { ensureTeacherForUser } from "@/lib/ensureTeacher";
import { apiError } from "@/lib/validate";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";

type Teacher = typeof schema.teachers.$inferSelect;

export type AuthResult =
  | { ok: true; teacher: Teacher }
  | { ok: false; response: Response };

export async function requireTeacher(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError("No autenticado", 401) };
  const teacher = await ensureTeacherForUser(user);
  return { ok: true, teacher };
}

export function forbid() {
  return apiError("No autorizado", 403);
}

export function assertOwnTeacher(teacher: Teacher, teacherId: number): Response | null {
  if (teacher.id !== teacherId) return forbid();
  return null;
}

export async function getSubjectIdsForTeacher(teacherId: number): Promise<number[]> {
  const rows = await db.query.subjects.findMany({
    where: eq(schema.subjects.teacherId, teacherId),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function getStudentIdsForTeacher(teacherId: number): Promise<number[]> {
  const ids = new Set<number>();

  const subjectIds = await getSubjectIdsForTeacher(teacherId);
  if (subjectIds.length > 0) {
    const ss = await db.query.subjectStudents.findMany({
      where: inArray(schema.subjectStudents.subjectId, subjectIds),
      columns: { studentId: true },
    });
    for (const r of ss) ids.add(r.studentId);
  }

  const ts = await db.query.teacherStudents.findMany({
    where: eq(schema.teacherStudents.teacherId, teacherId),
    columns: { studentId: true },
  });
  for (const r of ts) ids.add(r.studentId);

  return [...ids];
}

export async function assertSubjectOwned(subjectId: number, teacherId: number): Promise<Response | null> {
  const subject = await db.query.subjects.findFirst({
    where: eq(schema.subjects.id, subjectId),
    columns: { teacherId: true },
  });
  if (!subject || subject.teacherId !== teacherId) return forbid();
  return null;
}

export async function assertStudentAccessible(studentId: number, teacherId: number): Promise<Response | null> {
  const allowed = await getStudentIdsForTeacher(teacherId);
  if (!allowed.includes(studentId)) return forbid();
  return null;
}

export async function assertAssignmentOwned(assignmentId: number, teacherId: number): Promise<Response | null> {
  const row = await db.query.assignments.findFirst({
    where: eq(schema.assignments.id, assignmentId),
    columns: { teacherId: true },
  });
  if (!row || row.teacherId !== teacherId) return forbid();
  return null;
}

export async function assertAvailabilityOwned(availabilityId: number, teacherId: number): Promise<Response | null> {
  const row = await db.query.availabilities.findFirst({
    where: eq(schema.availabilities.id, availabilityId),
    columns: { teacherId: true },
  });
  if (!row || row.teacherId !== teacherId) return forbid();
  return null;
}

export async function assertTeacherBlockOwned(blockId: number, teacherId: number): Promise<Response | null> {
  const row = await db.query.teacherBlocks.findFirst({
    where: eq(schema.teacherBlocks.id, blockId),
    columns: { teacherId: true },
  });
  if (!row || row.teacherId !== teacherId) return forbid();
  return null;
}

export async function assertSlotRequestOwned(requestId: number, teacherId: number): Promise<Response | null> {
  const row = await db.query.slotRequests.findFirst({
    where: eq(schema.slotRequests.id, requestId),
    columns: { subjectId: true },
  });
  if (!row) return apiError("No encontrada", 404);
  return assertSubjectOwned(row.subjectId, teacherId);
}

export async function assertSubjectStudentOwned(rowId: number, teacherId: number): Promise<Response | null> {
  const row = await db.query.subjectStudents.findFirst({
    where: eq(schema.subjectStudents.id, rowId),
    columns: { subjectId: true },
  });
  if (!row) return apiError("No encontrado", 404);
  return assertSubjectOwned(row.subjectId, teacherId);
}

export async function assertStudentLinkable(studentId: number, teacherId: number): Promise<Response | null> {
  const links = await db.query.teacherStudents.findMany({
    where: eq(schema.teacherStudents.studentId, studentId),
    columns: { teacherId: true },
  });
  if (links.some((l) => l.teacherId !== teacherId)) return forbid();

  const enrollments = await db.query.subjectStudents.findMany({
    where: eq(schema.subjectStudents.studentId, studentId),
    with: { subject: { columns: { teacherId: true } } },
  });
  if (enrollments.some((e) => e.subject && e.subject.teacherId !== teacherId)) return forbid();

  // Huérfanos (sin vínculo ni inscripciones) solo se reclaman al crearlos vía POST /api/students.
  if (links.length === 0 && enrollments.length === 0) return forbid();

  return null;
}

export async function linkStudentToTeacher(teacherId: number, studentId: number): Promise<void> {
  const exists = await db.query.teacherStudents.findFirst({
    where: and(
      eq(schema.teacherStudents.teacherId, teacherId),
      eq(schema.teacherStudents.studentId, studentId),
    ),
  });
  if (!exists) {
    await db.insert(schema.teacherStudents).values({ teacherId, studentId });
  }
}
