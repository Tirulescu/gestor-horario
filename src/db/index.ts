import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schemaRaw from "./schema";
import * as relations from "./relations";

const connectionString = process.env.DATABASE_URL!;

// prepare: false — obligatorio con el pooler de Supabase en modo Transaction (puerto 6543)
const client = postgres(connectionString, { prepare: false });

const schema = { ...schemaRaw, ...relations };

export const db = drizzle(client, { schema });
export type Database = typeof db;
export { schema };
