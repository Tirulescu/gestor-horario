import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { apiError, safeJson, validateDay, validateHourRange } from "@/lib/validate";
import {
  requireTeacher,
  assertOwnTeacher,
  assertAvailabilityOwned,
  assertScheduleEditable,
} from "@/lib/auth/requireTeacher";

type AvailabilityPiece = { dayOfWeek: number; startHour: number; endHour: number };

function parsePieces(raw: unknown): AvailabilityPiece[] | string {
  if (!Array.isArray(raw)) return "pieces debe ser un array";
  const out: AvailabilityPiece[] = [];
  for (const item of raw) {
    const dayOfWeek = Number((item as { day?: unknown; dayOfWeek?: unknown }).dayOfWeek ?? (item as { day?: unknown }).day);
    const startHour = Number((item as { start?: unknown; startHour?: unknown }).startHour ?? (item as { start?: unknown }).start);
    const endHour = Number((item as { end?: unknown; endHour?: unknown }).endHour ?? (item as { end?: unknown }).end);
    const dErr = validateDay(dayOfWeek);
    if (dErr) return dErr;
    const hErr = validateHourRange(startHour, endHour);
    if (hErr) return hErr;
    out.push({ dayOfWeek, startHour, endHour });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const teacherIdParam = searchParams.get("teacherId");
  const teacherId = teacherIdParam ? Number(teacherIdParam) : auth.teacher.id;
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;

  const rows = await db.query.availabilities.findMany({
    where: eq(schema.availabilities.teacherId, teacherId),
    orderBy: (a, { asc }) => [asc(a.dayOfWeek), asc(a.startHour)],
  });
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const teacherId = Number(body.teacherId ?? auth.teacher.id);
  const dayOfWeek = Number(body.dayOfWeek);
  const startHour = Number(body.startHour);
  const endHour = Number(body.endHour);
  const denied = assertOwnTeacher(auth.teacher, teacherId);
  if (denied) return denied;
  if (!teacherId) return apiError("teacherId requerido");

  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  const [created] = await db.insert(schema.availabilities).values({ teacherId, dayOfWeek, startHour, endHour }).returning();
  return Response.json(created, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return apiError("id requerido");
  const denied = await assertAvailabilityOwned(id, auth.teacher.id);
  if (denied) return denied;

  await db.delete(schema.availabilities).where(eq(schema.availabilities.id, id));
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");
  const denied = await assertAvailabilityOwned(id, auth.teacher.id);
  if (denied) return denied;

  const row = await db.query.availabilities.findFirst({ where: eq(schema.availabilities.id, id) });
  if (!row) return apiError("No encontrada", 404);
  const dayOfWeek = body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : row.dayOfWeek;
  const startHour = body.startHour !== undefined ? Number(body.startHour) : row.startHour;
  const endHour = body.endHour !== undefined ? Number(body.endHour) : row.endHour;
  const dErr = validateDay(dayOfWeek);
  if (dErr) return apiError(dErr);
  const hErr = validateHourRange(startHour, endHour);
  if (hErr) return apiError(hErr);
  const [updated] = await db
    .update(schema.availabilities)
    .set({ dayOfWeek, startHour, endHour })
    .where(eq(schema.availabilities.id, id))
    .returning();
  return Response.json(updated);
}

/** Operaciones atómicas: sustituir una franja por varias, o borrar/crear en lote. */
export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  const locked = assertScheduleEditable(auth.teacher);
  if (locked) return locked;

  const body = (await safeJson(req)) as {
    replace?: { id?: unknown; pieces?: unknown };
    apply?: { removeIds?: unknown; adds?: unknown };
  };

  if (body.replace != null) {
    const id = Number(body.replace.id);
    if (!id) return apiError("replace.id requerido");
    const denied = await assertAvailabilityOwned(id, auth.teacher.id);
    if (denied) return denied;

    const row = await db.query.availabilities.findFirst({ where: eq(schema.availabilities.id, id) });
    if (!row) return apiError("No encontrada", 404);

    const parsed = parsePieces(body.replace.pieces ?? []);
    if (typeof parsed === "string") return apiError(parsed);

    const result = await db.transaction(async (tx) => {
      if (parsed.length === 0) {
        await tx.delete(schema.availabilities).where(eq(schema.availabilities.id, id));
        return { removed: 1, saved: 0, rows: [] as (typeof schema.availabilities.$inferSelect)[] };
      }
      if (parsed.length === 1) {
        const [updated] = await tx
          .update(schema.availabilities)
          .set(parsed[0])
          .where(eq(schema.availabilities.id, id))
          .returning();
        return { removed: 0, saved: 1, rows: updated ? [updated] : [] };
      }
      const rows = await tx
        .insert(schema.availabilities)
        .values(parsed.map((p) => ({ teacherId: row.teacherId, ...p })))
        .returning();
      await tx.delete(schema.availabilities).where(eq(schema.availabilities.id, id));
      return { removed: 1, saved: rows.length, rows };
    });

    return Response.json(result);
  }

  if (body.apply != null) {
    const removeIds = Array.isArray(body.apply.removeIds)
      ? body.apply.removeIds.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    const parsed = parsePieces(body.apply.adds ?? []);
    if (typeof parsed === "string") return apiError(parsed);

    for (const id of removeIds) {
      const denied = await assertAvailabilityOwned(id, auth.teacher.id);
      if (denied) return denied;
    }

    const result = await db.transaction(async (tx) => {
      if (removeIds.length > 0) {
        await tx.delete(schema.availabilities).where(inArray(schema.availabilities.id, removeIds));
      }
      const rows =
        parsed.length > 0
          ? await tx
              .insert(schema.availabilities)
              .values(parsed.map((p) => ({ teacherId: auth.teacher.id, ...p })))
              .returning()
          : [];
      return { removed: removeIds.length, saved: rows.length, rows };
    });

    return Response.json(result);
  }

  return apiError("replace o apply requerido");
}
