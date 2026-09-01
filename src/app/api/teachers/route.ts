import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { apiError, safeJson } from "@/lib/validate";
import { requireTeacher, assertOwnTeacher } from "@/lib/auth/requireTeacher";

export async function GET() {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;
  return Response.json([auth.teacher]);
}

export async function PUT(req: NextRequest) {
  const auth = await requireTeacher();
  if (!auth.ok) return auth.response;

  const body = await safeJson(req);
  const id = Number(body.id);
  if (!id) return apiError("id requerido");
  const denied = assertOwnTeacher(auth.teacher, id);
  if (denied) return denied;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return apiError("Nombre requerido");
    patch.name = name;
  }
  if (body.email !== undefined) {
    patch.email = body.email ? String(body.email) : null;
  }
  if (body.scheduleFixed !== undefined) {
    patch.scheduleFixed = Boolean(body.scheduleFixed);
  }
  if (Object.keys(patch).length === 0) return apiError("Nada que actualizar");

  const [updated] = await db
    .update(schema.teachers)
    .set(patch)
    .where(eq(schema.teachers.id, id))
    .returning();
  if (!updated) return apiError("No encontrado", 404);
  return Response.json(updated);
}
