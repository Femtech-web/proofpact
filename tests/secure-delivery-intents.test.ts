import assert from "node:assert/strict";
import test from "node:test";
import type { SecureDeliveryFraudInput } from "../features/verification/application/fraud-verification";
import { buildSecureDeliveryIntentQuestion, toStrictVerificationRecord, type SecureDeliveryIntent } from "../features/verification/application/secure-delivery-intents";
import type { TelegraphEngineResult } from "../infrastructure/telegraph/engine-client";

const input: SecureDeliveryFraudInput = {
  pactId: "pact-intents",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  rewardUsdc: 800,
  repositoryUrl: "https://github.com/example/api",
  commitSha: "9f3c2a1",
  deploymentUrl: "https://api.example.com",
  claimedRemediation: "Patched the vulnerable route.",
};

function routed(intent: SecureDeliveryIntent, result: TelegraphEngineResult["result"]): TelegraphEngineResult {
  return {
    minerId: "42",
    minerName: "ranked-miner",
    endpoint: "/analyze",
    result,
    costUsd: 0.01,
    durationMs: 100,
    timestamp: "2026-09-04T12:00:00.000Z",
    intent,
    signalHash: `0x${"a".repeat(64)}`,
    rawResponseHash: `0x${"b".repeat(64)}`,
    warnings: [],
  };
}

test("builds all strict requests over the same artifact commitment", () => {
  const requests = (["CVE_LOOKUP", "URL_SCAN", "SSL_VERIFICATION"] as const)
    .map((intent) => buildSecureDeliveryIntentQuestion(intent, input));
  assert.equal(new Set(requests.map((request) => request.artifactHash)).size, 1);
  assert.match(requests[0].query, /^CVE_LOOKUP:/);
  assert.match(requests[1].query, /^URL_SCAN:/);
  assert.match(requests[2].query, /^SSL_VERIFICATION:/);
});

test("normalizes only explicit structured outcomes", () => {
  const cases = [
    ["CVE_LOOKUP", { vulnerable: false, confidence: 0.9 }, "PASS"],
    ["URL_SCAN", { malicious: true, confidence: 0.8 }, "FAIL"],
    ["SSL_VERIFICATION", { certificate_status: "EXPIRED", confidence: 0.99 }, "FAIL"],
  ] as const;
  for (const [intent, value, expected] of cases) {
    const request = buildSecureDeliveryIntentQuestion(intent, input);
    assert.equal(toStrictVerificationRecord(intent, input, request, routed(intent, value), 1).verdict, expected);
  }
  const intent = "URL_SCAN";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const prose = toStrictVerificationRecord(intent, input, request, routed(intent, "looks safe"), 1);
  assert.equal(prose.verdict, "INCONCLUSIVE");
  assert.equal(prose.confidence, 0);
});
