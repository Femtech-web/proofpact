import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const migration = await readFile(new URL(
  "../infrastructure/persistence/migrations/005_pact_funding_evidence.sql",
  import.meta.url,
), "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});
try {
  await sql.unsafe(migration);
  console.log(JSON.stringify({ ok: true, migration: "005_pact_funding_evidence.sql" }));
} finally {
  await sql.end({ timeout: 5 });
}
