import "server-only";
import postgres from "postgres";

// One client per server process, reused across requests. SSL comes from the
// URL's `?sslmode=require` (Tiger Cloud's default), so a local Postgres works too.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql; // survives dev hot reloads
