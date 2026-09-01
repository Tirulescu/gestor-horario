import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no definida");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_collective boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS collective_session_id text`;
  await sql`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS schedule_fixed boolean NOT NULL DEFAULT false`;
  console.log("Migración aplicada: is_collective, collective_session_id, schedule_fixed");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
