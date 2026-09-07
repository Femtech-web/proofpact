import postgres from "postgres";
import { readFile } from "node:fs/promises";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
try {
  const migration = await readFile(new URL("../infrastructure/persistence/migrations/006_change_requests.sql", import.meta.url), "utf8");
  await sql.unsafe(migration);
  console.log(JSON.stringify({ ok: true, migration: "006_change_requests.sql" }));
} finally {
  await sql.end({ timeout: 5 });
}
