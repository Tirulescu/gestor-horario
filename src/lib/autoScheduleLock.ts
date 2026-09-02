import { sql } from "drizzle-orm";
import { db, type Database } from "@/db";

/**
 * Serializa auto-agendados concurrentes del mismo profesor (p. ej. doble clic).
 * Usa pg_advisory_xact_lock dentro de una transacción para que lock, lecturas y
 * escrituras compartan la misma conexión (obligatorio con pool de Supabase/postgres.js).
 */
export async function withTeacherScheduleLock<T>(
  teacherId: number,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${teacherId})`);
    return fn(tx as unknown as Database);
  });
}
