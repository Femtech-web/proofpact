import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createPostgresVerificationAttemptStore } from "../infrastructure/persistence/postgres-verification-attempt-store";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const eventId = randomUUID();
const runId = `database-smoke-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const occurredAt = new Date().toISOString();
const store = createPostgresVerificationAttemptStore(databaseUrl);

try {
  await store.append({
    eventId,
    runId,
    pactId: "system-database-smoke",
    intent: "FRAUD_DETECTION",
    attemptNumber: 1,
    occurredAt,
    type: "STARTED",
  });
} finally {
  await store.close();
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

try {
  const rows = await sql<readonly [{
    event_id: string;
    run_id: string;
    pact_id: string;
    intent: string;
    attempt_number: number;
    event_type: string;
  }]>`
    SELECT event_id, run_id, pact_id, intent, attempt_number, event_type
    FROM verification_attempt_events
    WHERE event_id = ${eventId}
  `;
  const row = rows[0];
  if (!row
    || row.run_id !== runId
    || row.pact_id !== "system-database-smoke"
    || row.intent !== "FRAUD_DETECTION"
    || row.attempt_number !== 1
    || row.event_type !== "STARTED") {
    throw new Error("Attempt event could not be read back exactly");
  }
  console.log(JSON.stringify({
    ok: true,
    eventId: row.event_id,
    runId: row.run_id,
    eventType: row.event_type,
  }));
} finally {
  await sql.end({ timeout: 5 });
}
