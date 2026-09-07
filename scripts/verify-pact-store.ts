import { createPostgresPactStore } from "../infrastructure/persistence/postgres-pact-store";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const store = createPostgresPactStore(databaseUrl);
try {
  const pactInput = {
    idempotencyKey: "system-pact-store-smoke-v1",
    requesterAddress: "0x1111111111111111111111111111111111111111" as const,
    workerAddress: "0x2222222222222222222222222222222222222222" as const,
    policyPackId: "secure-delivery" as const,
    policyVersion: "DELIVERY_V1",
    title: "System persistence verification",
    acceptanceCriteria: "Verify idempotent durable persistence without funding or external execution.",
    rewardUsdc: "1.000000",
    chainId: 84532,
  };
  const pact = await store.createPact(pactInput);
  const repeatedPact = await store.createPact(pactInput);
  if (pact.id !== repeatedPact.id) throw new Error("Pact idempotency failed");

  const submissionInput = {
    idempotencyKey: "system-submission-smoke-v1",
    pactId: pact.id,
    submittedBy: pact.workerAddress,
    artifactHash: `0x${"a".repeat(64)}` as `0x${string}`,
    evidence: { kind: "SYSTEM_SMOKE", repository_url: "https://example.invalid/proofpact-smoke" },
    claimedRemediation: "System-only persistence proof; no delivery or settlement claim.",
  };
  const submission = await store.createSubmission(submissionInput);
  const repeatedSubmission = await store.createSubmission(submissionInput);
  if (submission.id !== repeatedSubmission.id) throw new Error("Submission idempotency failed");

  const completedAt = "2026-09-05T00:00:00.000Z";
  const completion = {
    pactId: pact.id,
    submissionId: submission.id,
    runId: "00000000-0000-4000-8000-000000000003",
    idempotencyKey: "system-verification-smoke-v1",
    signals: [{
      intent: "FRAUD_DETECTION" as const,
      minerId: "system-smoke-miner",
      signalHash: `0x${"b".repeat(64)}` as `0x${string}`,
      verdict: "INCONCLUSIVE" as const,
      confidence: 0,
      observedAt: completedAt,
    }],
    decision: {
      decision: "RETRY" as const,
      reason: "System smoke evidence is intentionally inconclusive.",
      missingIntents: ["FRAUD_DETECTION", "CVE_LOOKUP", "URL_SCAN", "SSL_VERIFICATION"],
      policyVersion: "DELIVERY_V1",
      decidedAt: completedAt,
    },
    receipt: {
      receiptHash: `0x${"c".repeat(64)}` as `0x${string}`,
      artifactHash: submission.artifactHash,
      decision: "RETRY" as const,
      payload: {
        kind: "SYSTEM_SMOKE",
        pact_id: pact.id,
        submission_id: submission.id,
        decision: "RETRY",
      },
    },
  };
  const receipt = await store.completeVerification(completion);
  const repeatedReceipt = await store.completeVerification(completion);
  if (receipt.id !== repeatedReceipt.id) throw new Error("Verification idempotency failed");

  console.log(JSON.stringify({
    status: "PACT_STORE_VERIFIED",
    pactId: pact.id,
    submissionId: submission.id,
    receiptId: receipt.id,
    finalStatus: (await store.getPact(pact.id))?.status,
    idempotent: true,
  }, null, 2));
} finally {
  await store.close();
}
