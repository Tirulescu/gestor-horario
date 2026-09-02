import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import { durationMinError, sessionPartsFitDuration, SESSION_PART_MIN } from "@/lib/hours";
import {
  requireTeacher,
  assertSubjectOwned,
  getStudentIdsForTeacher,
  assertScheduleEditable,
} from "@/lib/auth/requireTeacher";

async function enrollStudentInSubject(
  subjectId: number,
  studentId: number,
  durationMin: number | null,
  slotsRequired: number,
  sessionParts = 1,
) {
  const exists = await db.query.subjectStudents.findFirst({
    where: and(
      eq(schema.subjectStudents.subjectId, subjectId),
      eq(schema.subjectStudents.studentId, studentId),
    ),
  });
  if (exists) return { enrolled: false, row: exists };

  const siblings = await db.query.subjectStudents.findMany({
    where: eq(schema.subjectStudents.subjectId, subjectId),
  });
  const maxP = siblings.reduce((m, x) => Math.max(m, x.priority), 0);
  const priority = siblings.length === 0 ? 1 : maxP + 1;
  const parts = Math.min(12, Math.max(1, Math.floor(sessionParts) || 1));

  const [created] = await db
    .insert(schema.subjectStudents)
    .values({ subjectId, studentId, durationMin, priority, slotsRequired, sessionParts: parts })
    .returning();
  return { enrolled: true, row: created };
}

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const subjectId = Number(new URL(req.url).searchParams.get("subjectId"));
  if (!subjectId) return apiError("subjectId requerido");

  const denied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (denied) return denied;

  const rows = await db.query.subjectGradeDurations.findMany({
    where: eq(schema.subjectGradeDurations.subjectId, subjectId),
    orderBy: (g, { asc }) => [asc(g.grade)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const subjectId = Number(body.subjectId);
  const grade = String(body.grade ?? "").trim();
  const durationMin = Number(body.durationMin);
  const slotsRequired = Number(body.slotsRequired ?? 1);
  let sessionParts = body.sessionParts != null ? Number(body.sessionParts) : 1;
  if (!Number.isFinite(sessionParts) || sessionParts < 1) sessionParts = 1;
  sessionParts = Math.min(12, Math.floor(sessionParts));
  const enroll = body.enroll !== false;

  if (!subjectId || !grade) return apiError("subjectId y grade requeridos");
  const dErr = durationMinError(durationMin);
  if (dErr) return apiError(dErr);
  if (sessionParts > 1 && !sessionPartsFitDuration(durationMin, sessionParts)) {
    const max = Math.floor(durationMin / SESSION_PART_MIN);
    return apiError(
      `Con ${durationMin} min debes dividir en exactamente ${max} partes de ${SESSION_PART_MIN} min (o no dividir)`,
    );
  }

  const denied = await assertSubjectOwned(subjectId, auth.teacher.id);
  if (denied) return denied;

  const existing = await db.query.subjectGradeDurations.findFirst({
    where: and(
      eq(schema.subjectGradeDurations.subjectId, subjectId),
      eq(schema.subjectGradeDurations.grade, grade),
    ),
  });

  let rule;
  if (existing) {
    [rule] = await db
      .update(schema.subjectGradeDurations)
      .set({ durationMin, slotsRequired, sessionParts })
      .where(eq(schema.subjectGradeDurations.id, existing.id))
      .returning();
  } else {
    [rule] = await db
      .insert(schema.subjectGradeDurations)
      .values({ subjectId, grade, durationMin, slotsRequired, sessionParts })
      .returning();
  }

  let enrolled = 0;
  let skipped = 0;
  if (enroll) {
    const allowedIds = await getStudentIdsForTeacher(auth.teacher.id);
    if (allowedIds.length === 0) {
      return Response.json({ rule, enrolled: 0, skipped: 0 }, { status: existing ? 200 : 201 });
    }
    const students = await db.query.students.findMany({
      where: inArray(schema.students.id, allowedIds),
      columns: { id: true, grade: true },
    });
    const targets = students.filter((s) => (s.grade ?? "").trim() === grade);

    for (const st of targets) {
      const result = await enrollStudentInSubject(subjectId, st.id, durationMin, slotsRequired, sessionParts);
      if (result.enrolled) enrolled++;
      else skipped++;
    }
  }

  return Response.json({ rule, enrolled, skipped }, { status: existing ? 200 : 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");

  const row = await db.query.subjectGradeDurations.findFirst({
    where: eq(schema.subjectGradeDurations.id, id),
    columns: { subjectId: true },
  });
  if (!row) return apiError("No encontrado", 404);

  const denied = await assertSubjectOwned(row.subjectId, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.subjectGradeDurations).where(eq(schema.subjectGradeDurations.id, id));
  return Response.json({ ok: true });
}
