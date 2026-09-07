import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

try {
  const runs = await sql<readonly [{ run_id: string; pact_id: string }]>`
    SELECT run_id, pact_id
    FROM verification_attempt_events
    WHERE pact_id <> 'system-database-smoke'
    ORDER BY occurred_at DESC
    LIMIT 1
  `;
  const latest = runs[0];
  if (!latest) throw new Error("No live verification run was found");

  const rootRunId = latest.run_id.includes(":")
    ? latest.run_id.slice(0, latest.run_id.indexOf(":"))
    : latest.run_id;
  const events = await sql<readonly [{
    run_id: string;
    attempt_number: number;
    event_type: string;
    miner_id: string | null;
    authorized_amount_usdc: string | null;
    payload: Record<string, unknown>;
    occurred_at: Date;
  }]>`
    SELECT run_id, attempt_number, event_type, miner_id, authorized_amount_usdc, payload, occurred_at
    FROM verification_attempt_events
    WHERE run_id = ${rootRunId}
       OR run_id LIKE ${`${rootRunId}:%`}
    ORDER BY occurred_at ASC, event_type ASC
  `;

  const receipts = await sql<readonly [{
    receipt_id: string;
    receipt_hash: string;
    decision: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }]>`
    SELECT receipt_id, receipt_hash, decision, payload, created_at
    FROM pact_receipts
    WHERE pact_id = ${latest.pact_id}
      AND run_id = ${rootRunId}
    ORDER BY created_at DESC
  `;

  console.log(JSON.stringify({
    runId: rootRunId,
    pactId: latest.pact_id,
    attempts: [...new Set(events.map((event) => event.attempt_number))].length,
    paymentAuthorizationEvents: events.filter((event) => event.event_type === "PAYMENT_AUTHORIZED").length,
    events: events
      .filter((event) => ["PAYMENT_AUTHORIZED", "PAYMENT_RECONCILED", "SUCCEEDED", "DUPLICATE", "FAILED"].includes(event.event_type))
      .map((event) => ({
        attemptNumber: event.attempt_number,
        routeRunId: event.run_id,
        type: event.event_type,
        minerId: event.miner_id,
        authorizedAmountUsdc: event.authorized_amount_usdc,
        ...(event.event_type === "PAYMENT_AUTHORIZED" ? {
          amountUsdc: (event.payload.payment as Record<string, unknown> | undefined)?.amountUsdc,
          network: (event.payload.payment as Record<string, unknown> | undefined)?.network,
          asset: (event.payload.payment as Record<string, unknown> | undefined)?.asset,
          payTo: (event.payload.payment as Record<string, unknown> | undefined)?.payTo,
          maxTimeoutSeconds: (event.payload.payment as Record<string, unknown> | undefined)?.maxTimeoutSeconds,
          cumulativeAuthorizedCostUsdc: event.payload.cumulativeAuthorizedCostUsdc,
        } : {}),
        ...(event.event_type === "FAILED" ? {
          errorCode: event.payload.errorCode,
          paymentState: event.payload.paymentState,
          retryable: event.payload.retryable,
          diagnostic: event.payload.diagnostic,
        } : {}),
        ...(event.event_type === "PAYMENT_RECONCILED" ? {
          reconciliationState: event.payload.reconciliationState,
          retryPermitted: event.payload.retryPermitted,
          evidence: event.payload.evidence,
        } : {}),
        occurredAt: event.occurred_at.toISOString(),
      })),
    receipts: receipts.map((receipt) => ({
      receiptId: receipt.receipt_id,
      receiptHash: receipt.receipt_hash,
      decision: receipt.decision,
      authorizedCostUsdc: receipt.payload.authorized_cost_usdc,
      settledCostUsdc: receipt.payload.settled_cost_usdc,
      missingIntents: receipt.payload.missing_intents,
      records: receipt.payload.records,
      createdAt: receipt.created_at.toISOString(),
    })),
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
