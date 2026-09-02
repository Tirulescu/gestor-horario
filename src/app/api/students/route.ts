import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import { firstAvailabilityBlockedConflict, normalizeRanges } from "@/lib/studentAvailability";
import {
  requireTeacher,
  assertOwnTeacher,
  assertStudentAccessible,
  getStudentIdsForTeacher,
  linkStudentToTeacher,
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

  const body = await safeJson(req);
  const name = String(body.name ?? "").trim();
  if (!name) return apiError("Nombre requerido");
  const email = body.email ? String(body.email) : null;
  const grade = body.grade != null && String(body.grade).trim() !== "" ? String(body.grade).trim() : null;
  const [created] = await db.insert(schema.students).values({ name, email, grade }).returning();
  await linkStudentToTeacher(auth.teacher.id, created.id);
  return Response.json(created, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

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
  if (body.blockedRanges !== undefined) {
    const arr = Array.isArray(body.blockedRanges) ? body.blockedRanges : [];
    patch.blockedRanges = arr
      .map((b: { day?: unknown; start?: unknown; end?: unknown }) => ({
        day: Number(b.day), start: Number(b.start), end: Number(b.end),
      }))
      .filter((b: { day: number; start: number; end: number }) => Number.isFinite(b.day) && Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
  }
  if (body.availableRanges !== undefined) {
    const available = normalizeRanges(body.availableRanges);
    const blocked =
      body.blockedRanges !== undefined
        ? normalizeRanges(body.blockedRanges)
        : normalizeRanges(
            (await db.query.students.findFirst({
              where: eq(schema.students.id, id),
              columns: { blockedRanges: true },
            }))?.blockedRanges
          );
    if (firstAvailabilityBlockedConflict(available, blocked)) {
      return apiError("La disponibilidad no puede incluir horas bloqueadas");
    }
    patch.availableRanges = available;
  }
  const [updated] = await db.update(schema.students).set(patch).where(eq(schema.students.id, id)).returning();
  if (!updated) return apiError("No encontrado", 404);
  return Response.json(updated);
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");
  const denied = await assertStudentAccessible(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.students).where(eq(schema.students.id, id));
  return Response.json({ ok: true });
}
