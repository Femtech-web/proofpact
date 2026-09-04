import assert from "node:assert/strict";
import test from "node:test";
import { buildFraudQuestion, toFraudVerificationRecord, type SecureDeliveryFraudInput } from "../features/verification/application/fraud-verification";
import type { TelegraphEngineResult } from "../infrastructure/telegraph/engine-client";

const input: SecureDeliveryFraudInput = {
  pactId: "pact-7d31",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  rewardUsdc: 800,
  repositoryUrl: "https://github.com/example/api",
  commitSha: "9f3c2a1",
  deploymentUrl: "https://api.example.com",
  claimedRemediation: "Upgrade the affected dependency and remove the vulnerable route.",
};

function routed(result: TelegraphEngineResult["result"]): TelegraphEngineResult {
  return {
    minerId: "42",
    minerName: "ranked-fraud-miner",
    endpoint: "/analyze",
    result,
    costUsd: 0.01,
    durationMs: 210,
    timestamp: "2026-09-04T12:00:00.000Z",
    intent: "FRAUD_DETECTION",
    signalHash: `0x${"a".repeat(64)}`,
    rawResponseHash: `0x${"b".repeat(64)}`,
    paymentReceipt: { headerHash: `0x${"c".repeat(64)}`, success: true, transaction: "0xpayment" },
    warnings: [],
  };
}

test("builds a stable, artifact-bound fraud request", () => {
  const first = buildFraudQuestion(input);
  const second = buildFraudQuestion(input);
  assert.equal(first.artifactHash, second.artifactHash);
  assert.match(first.query, /FRAUD_DETECTION/);
  assert.equal((first.context as Record<string, unknown>).policy_version, "DELIVERY_V1");
});

test("normalizes structured fraud evidence and records its provenance", () => {
  const request = buildFraudQuestion(input);
  const record = toFraudVerificationRecord(input, request, routed({ verdict: "BLOCK", confidence: 0.96 }));
  assert.equal(record.verdict, "FAIL");
  assert.equal(record.confidence, 0.96);
  assert.equal(record.minerId, "42");
  assert.equal(record.attemptNumber, 1);
  assert.equal(record.paymentReference, "0xpayment");
  assert.equal(record.artifactHash, request.artifactHash);
});

test("abstains on prose or ambiguous payloads instead of inventing safety", () => {
  const request = buildFraudQuestion(input);
  const record = toFraudVerificationRecord(input, request, routed("Looks mostly fine"));
  assert.equal(record.verdict, "INCONCLUSIVE");
  assert.equal(record.confidence, 0);
});
