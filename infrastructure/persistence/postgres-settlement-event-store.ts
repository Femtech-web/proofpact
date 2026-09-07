import "server-only";

import { randomUUID } from "node:crypto";
import postgres from "postgres";

export type SettlementEventInput = Readonly<{
  pactId: string;
  receiptId: string;
  eventType: "AUTHORIZED" | "SUBMITTED" | "CONFIRMED" | "FAILED";
  escrowAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountBaseUnits: string;
  authorizerAddress: `0x${string}`;
  authorizerNonce: string;
  transactionHash?: `0x${string}`;
  failureCode?: string;
}>;

export async function appendSettlementEvent(databaseUrl: string, event: SettlementEventInput): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
  try {
    await sql`
      INSERT INTO settlement_execution_events (
        event_id, pact_id, receipt_id, event_type, action, chain_id, escrow_address,
        token_address, recipient_address, amount_base_units, authorizer_address,
        authorizer_nonce, transaction_hash, failure_code, occurred_at
      ) VALUES (
        ${randomUUID()}, ${event.pactId}, ${event.receiptId}, ${event.eventType}, 'RELEASE', 84532,
        ${event.escrowAddress.toLowerCase()}, ${event.tokenAddress.toLowerCase()}, ${event.recipientAddress.toLowerCase()},
        ${event.amountBaseUnits}, ${event.authorizerAddress.toLowerCase()}, ${event.authorizerNonce},
        ${event.transactionHash?.toLowerCase() ?? null}, ${event.failureCode ?? null}, now()
      )
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function confirmSettlementEvent(databaseUrl: string, event: SettlementEventInput): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
  try {
    await sql.begin(async (tx) => {
      const existing = await tx<readonly { transaction_hash: string }[]>`
        SELECT transaction_hash FROM settlement_execution_events
        WHERE receipt_id = ${event.receiptId} AND event_type = 'CONFIRMED'
      `;
      if (existing[0]) {
        if (existing[0].transaction_hash !== event.transactionHash?.toLowerCase()) throw new Error("Receipt was already settled by a different transaction");
        return;
      }
      await tx`
        INSERT INTO settlement_execution_events (
          event_id, pact_id, receipt_id, event_type, action, chain_id, escrow_address,
          token_address, recipient_address, amount_base_units, authorizer_address,
          authorizer_nonce, transaction_hash, failure_code, occurred_at
        ) VALUES (
          ${randomUUID()}, ${event.pactId}, ${event.receiptId}, 'CONFIRMED', 'RELEASE', 84532,
          ${event.escrowAddress.toLowerCase()}, ${event.tokenAddress.toLowerCase()}, ${event.recipientAddress.toLowerCase()},
          ${event.amountBaseUnits}, ${event.authorizerAddress.toLowerCase()}, ${event.authorizerNonce},
          ${event.transactionHash?.toLowerCase() ?? null}, null, now()
        )
      `;
      await tx`UPDATE pacts SET status = 'RELEASED', updated_at = now() WHERE pact_id = ${event.pactId} AND status = 'APPROVED'`;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function getConfirmedSettlementTransaction(
  databaseUrl: string,
  receiptId: string,
): Promise<`0x${string}` | undefined> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });
  try {
    const rows = await sql<readonly { transaction_hash: `0x${string}` }[]>`
      SELECT transaction_hash
      FROM settlement_execution_events
      WHERE receipt_id = ${receiptId} AND event_type = 'CONFIRMED' AND transaction_hash IS NOT NULL
      ORDER BY occurred_at DESC
      LIMIT 1
    `;
    return rows[0]?.transaction_hash;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
