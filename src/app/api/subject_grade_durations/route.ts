import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import {
  requireTeacher,
  assertSubjectOwned,
  getStudentIdsForTeacher,
} from "@/lib/auth/requireTeacher";

async function enrollStudentInSubject(
  subjectId: number,
  studentId: number,
  durationMin: number | null,
  slotsRequired: number,
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

  const [created] = await db
    .insert(schema.subjectStudents)
    .values({ subjectId, studentId, durationMin, priority, slotsRequired })
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

  const body = await safeJson(req);
  const subjectId = Number(body.subjectId);
  const grade = String(body.grade ?? "").trim();
  const durationMin = Number(body.durationMin);
  const slotsRequired = Number(body.slotsRequired ?? 1);
  const enroll = body.enroll !== false;

  if (!subjectId || !grade) return apiError("subjectId y grade requeridos");
  if (!durationMin || durationMin < 5) return apiError("durationMin debe ser al menos 5");

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
      .set({ durationMin, slotsRequired })
      .where(eq(schema.subjectGradeDurations.id, existing.id))
      .returning();
  } else {
    [rule] = await db
      .insert(schema.subjectGradeDurations)
      .values({ subjectId, grade, durationMin, slotsRequired })
      .returning();
  }

  let enrolled = 0;
  let skipped = 0;
  if (enroll) {
    const allowedIds = new Set(await getStudentIdsForTeacher(auth.teacher.id));
    const students = await db.query.students.findMany({
      columns: { id: true, grade: true },
    });
    const targets = students.filter(
      (s) => allowedIds.has(s.id) && (s.grade ?? "").trim() === grade,
    );

    for (const st of targets) {
      const result = await enrollStudentInSubject(subjectId, st.id, durationMin, slotsRequired);
      if (result.enrolled) enrolled++;
      else skipped++;
    }
  }

  return Response.json({ rule, enrolled, skipped }, { status: existing ? 200 : 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

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
