import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const migrationUrl = new URL(
  "../infrastructure/persistence/migrations/004_settlement_execution_events.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

try {
  await sql.unsafe(migration);
  console.log(JSON.stringify({ ok: true, migration: "004_settlement_execution_events.sql" }));
} finally {
  await sql.end({ timeout: 5 });
}
