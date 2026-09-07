import postgres from "postgres";
import { withPactStore } from "../app/app/_lib/pact-data";
import { getPolicyPack } from "../features/policies/domain/policy-pack";
import { canonicalJson, sha256Hex, type JsonValue } from "../shared/json/canonical-json";

const pactId = process.argv.find((value) => value.startsWith("--pact="))?.slice(7);
const rootRunId = process.argv.find((value) => value.startsWith("--run="))?.slice(6);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!pactId || !rootRunId || !databaseUrl) throw new Error("DATABASE_URL, --pact, and --run are required");

const { pact, submission, priorReceipt } = await withPactStore(async (store) => ({
  pact: await store.getPact(pactId),
  submission: await store.getLatestSubmission(pactId),
  priorReceipt: await store.getLatestReceiptForPact(pactId),
}));
if (!pact || !submission) throw new Error("Pact or submission was not found");
if (priorReceipt?.submissionId === submission.id) {
  console.log(JSON.stringify({ status: "ALREADY_RECOVERED", receiptId: priorReceipt.id }, null, 2));
  process.exit(0);
}
if (pact.status !== "VERIFYING") throw new Error(`Expected VERIFYING pact, received ${pact.status}`);

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 30, idle_timeout: 10, prepare: false, ssl: "require" });
try {
  const events = await sql<readonly {
    run_id: string;
    intent: string;
    attempt_number: number;
    event_type: string;
    miner_id: string | null;
    authorized_amount_usdc: string | null;
    payload: Record<string, unknown>;
    occurred_at: Date;
  }[]>`
    SELECT run_id, intent, attempt_number, event_type, miner_id,
           authorized_amount_usdc, payload, occurred_at
    FROM verification_attempt_events
    WHERE run_id LIKE ${`${rootRunId}:%`}
    ORDER BY occurred_at ASC
  `;
  if (events.length === 0) throw new Error("No attempt events were found for this run");

  const authorizationByAttempt = new Map<string, number>();
  for (const event of events) {
    if (event.event_type === "PAYMENT_AUTHORIZED" && event.authorized_amount_usdc) {
      authorizationByAttempt.set(`${event.run_id}:${event.attempt_number}`, Number(event.authorized_amount_usdc));
    }
  }
  const authorizedCostUsdc = [...authorizationByAttempt.values()].reduce((sum, value) => sum + value, 0);
  const settledAttempts = new Set<string>();
  for (const event of events) {
    const key = `${event.run_id}:${event.attempt_number}`;
    if (event.event_type === "SUCCEEDED") settledAttempts.add(key);
    if (event.event_type === "PAYMENT_RECONCILED" && event.payload.reconciliationState === "SETTLED") settledAttempts.add(key);
  }
  const settledCostUsdc = [...settledAttempts].reduce((sum, key) => sum + (authorizationByAttempt.get(key) ?? 0), 0);
  const decidedAt = new Date().toISOString();
  const missingIntents = [...getPolicyPack(pact.policyPackId).requiredIntents];
  const payload = {
    version: 1,
    kind: "PROOFPACT_RECOVERED_VERIFICATION_RECEIPT",
    pact_id: pact.id,
    submission_id: submission.id,
    artifact_hash: submission.artifactHash,
    policy_pack: pact.policyPackId,
    policy_version: pact.policyVersion,
    decision: "RETRY",
    reason: "A paid route settled but its response was unavailable. No retry or release authority was created.",
    missing_intents: missingIntents,
    authorized_cost_usdc: authorizedCostUsdc,
    settled_cost_usdc: settledCostUsdc,
    recovered_run_id: rootRunId,
    attempt_events: events.map((event) => ({
      route_run_id: event.run_id,
      intent: event.intent,
      attempt: event.attempt_number,
      type: event.event_type,
      miner_id: event.miner_id,
      occurred_at: event.occurred_at.toISOString(),
      ...(event.event_type === "PAYMENT_RECONCILED" ? {
        reconciliation_state: event.payload.reconciliationState as string,
        evidence: event.payload.evidence as JsonValue,
      } : {}),
    })),
    decided_at: decidedAt,
  } satisfies JsonValue;
  const receiptHash = sha256Hex(canonicalJson(payload));
  const receipt = await withPactStore((store) => store.completeVerification({
    pactId: pact.id,
    submissionId: submission.id,
    runId: rootRunId,
    idempotencyKey: `secure-delivery-${submission.id}`,
    signals: [],
    decision: {
      decision: "RETRY",
      reason: payload.reason,
      missingIntents,
      policyVersion: pact.policyVersion,
      decidedAt,
    },
    receipt: { receiptHash, artifactHash: submission.artifactHash, decision: "RETRY", payload },
  }));
  console.log(JSON.stringify({
    status: "RECOVERED_TO_HELD",
    pactId,
    runId: rootRunId,
    receiptId: receipt.id,
    receiptHash,
    authorizedCostUsdc,
    settledCostUsdc,
  }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
