import type { User } from "@supabase/supabase-js";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getGoogleDisplayName } from "@/lib/userDisplay";

export async function ensureTeacherForUser(user: User) {
  const name = getGoogleDisplayName(user);
  const email = user.email ?? null;

  const existing = await db.query.teachers.findFirst({
    where: eq(schema.teachers.authUserId, user.id),
  });

  if (existing) {
    if (existing.name !== name || existing.email !== email) {
      const [updated] = await db
        .update(schema.teachers)
        .set({ name, email })
        .where(eq(schema.teachers.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  try {
    const [created] = await db
      .insert(schema.teachers)
      .values({
        name,
        email,
        authUserId: user.id,
      })
      .returning();
    return created;
  } catch {
    // Carrera concurrente en el primer login: otro request ya creó el profesor.
    const raced = await db.query.teachers.findFirst({
      where: eq(schema.teachers.authUserId, user.id),
    });
    if (raced) return raced;
    throw new Error("No se pudo crear el perfil de profesor");
  }
}
