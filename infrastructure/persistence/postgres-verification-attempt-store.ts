import "server-only";

import postgres, { type Sql } from "postgres";
import type {
  VerificationAttemptEvent,
  VerificationAttemptStore,
} from "@/features/verification/application/verification-attempt-store";

export type PostgresVerificationAttemptStore = VerificationAttemptStore & Readonly<{
  close(): Promise<void>;
}>;

function createStore(sql: Sql): PostgresVerificationAttemptStore {
  return Object.freeze({
    async append(event: VerificationAttemptEvent): Promise<void> {
      const minerId = "minerId" in event ? event.minerId : null;
      const authorizedAmountUsdc = event.type === "PAYMENT_AUTHORIZED" ? event.payment.amountUsdc : null;
      await sql`
        INSERT INTO verification_attempt_events (
          event_id,
          run_id,
          pact_id,
          intent,
          attempt_number,
          event_type,
          miner_id,
          authorized_amount_usdc,
          payload,
          occurred_at
        ) VALUES (
          ${event.eventId},
          ${event.runId},
          ${event.pactId},
          ${event.intent},
          ${event.attemptNumber},
          ${event.type},
          ${minerId},
          ${authorizedAmountUsdc},
          ${sql.json(event as unknown as postgres.JSONValue)},
          ${event.occurredAt}
        )
      `;
    },
    close: () => sql.end({ timeout: 5 }),
  });
}

export function createPostgresVerificationAttemptStore(databaseUrl: string): PostgresVerificationAttemptStore {
  const value = databaseUrl.trim();
  if (!value) throw new TypeError("databaseUrl is required");
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new TypeError("databaseUrl must use postgres:// or postgresql://");
  }
  return createStore(postgres(value, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
    ssl: "require",
  }));
}

export function createPostgresVerificationAttemptStoreFromSql(sql: Sql): PostgresVerificationAttemptStore {
  return createStore(sql);
}
