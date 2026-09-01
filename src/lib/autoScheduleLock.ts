import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Serializa auto-agendados concurrentes del mismo profesor (p. ej. doble clic). */
export async function withTeacherScheduleLock<T>(teacherId: number, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`SELECT pg_advisory_lock(${teacherId})`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${teacherId})`);
  }
}
