import assert from "node:assert/strict";
import test from "node:test";
import type { SecureDeliveryFraudInput } from "../features/verification/application/fraud-verification";
import { buildCommitEvidenceUrl, buildSecureDeliveryIntentQuestion, toStrictVerificationRecord, type SecureDeliveryIntent } from "../features/verification/application/secure-delivery-intents";
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
  const requests = (["CVE_LOOKUP", "FACT_CHECK", "WEB_SEARCH", "CONTENT_EXTRACTION", "AGENT_TASK", "URL_SCAN", "SSL_VERIFICATION"] as const)
    .map((intent) => buildSecureDeliveryIntentQuestion(intent, input));
  assert.equal(new Set(requests.map((request) => request.artifactHash)).size, 1);
  assert.match(requests[0].query, /^CVE_LOOKUP:/);
  assert.match(requests[1].query, /^FACT_CHECK:/);
  assert.match(requests[2].query, /^WEB_SEARCH:/);
  assert.match(requests[3].query, /^CONTENT_EXTRACTION:/);
  assert.match(requests[4].query, /^AGENT_TASK:/);
  assert.match(requests[5].query, /^URL_SCAN:/);
  assert.match(requests[6].query, /^SSL_VERIFICATION:/);
  assert.ok(requests
    .filter((request) => !request.query.startsWith("CONTENT_EXTRACTION:"))
    .every((request) => request.query.includes(input.deploymentUrl)));
  assert.ok(requests[3].query.includes("https://github.com/example/api/commit/9f3c2a1"));
  assert.ok(requests[0].query.includes(input.commitSha));
});

test("builds immutable commit evidence permalinks for supported public forges", () => {
  assert.equal(
    buildCommitEvidenceUrl("https://github.com/example/api.git", "9F3C2A1"),
    "https://github.com/example/api/commit/9f3c2a1",
  );
  assert.equal(
    buildCommitEvidenceUrl("https://gitlab.com/example/api", "9f3c2a1"),
    "https://gitlab.com/example/api/-/commit/9f3c2a1",
  );
  assert.throws(() => buildCommitEvidenceUrl("https://example.com/example/api", "9f3c2a1"), /supports GitHub/);
});

test("derives URL confidence from an explicit normalized risk score", () => {
  const intent = "URL_SCAN";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const result = toStrictVerificationRecord(intent, input, request, routed(intent, { verdict: "safe", risk: 0.1 }), 1);
  assert.equal(result.verdict, "PASS");
  assert.equal(result.confidence, 0.9);
});

test("honors an embedded WEB_SEARCH verdict instead of its transport status", () => {
  const intent = "WEB_SEARCH";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const result = toStrictVerificationRecord(intent, input, request, routed(intent, {
    status: "ok",
    confidence: 0.9,
    answer: '{"verdict":"INCONCLUSIVE","confidence":0.28,"reason":"Exact commit was not inspected."} Answered from live search.',
  }), 1);
  assert.equal(result.verdict, "INCONCLUSIVE");
  assert.equal(result.confidence, 0.28);
});

test("does not treat a FACT_CHECK transport status as proof of the claim", () => {
  const intent = "FACT_CHECK";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const result = toStrictVerificationRecord(intent, input, request, routed(intent, {
    status: "ok",
    confidence: 0.9,
    answer: '{"verdict":"INCONCLUSIVE","confidence":0.31,"reason":"The exact commit was not inspected."}',
  }), 1);
  assert.equal(result.verdict, "INCONCLUSIVE");
  assert.equal(result.confidence, 0.31);
});

test("passes direct commit extraction only when URL, repository, SHA, and claim evidence agree", () => {
  const intent = "CONTENT_EXTRACTION";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const matching = toStrictVerificationRecord(intent, input, request, routed(intent, {
    url: "https://github.com/example/api/commit/9f3c2a1",
    title: "fix: patch vulnerable route · example/api@9f3c2a1",
    excerpt: "Patched the vulnerable route and added coverage.",
    confidence: 0.95,
  }), 1);
  assert.equal(matching.verdict, "PASS");
  assert.equal(matching.confidence, 0.95);

  const wrongPage = toStrictVerificationRecord(intent, input, request, routed(intent, {
    url: "https://github.com/example/other/commit/9f3c2a1",
    title: "example/other@9f3c2a1",
    confidence: 0.95,
  }), 1);
  assert.equal(wrongPage.verdict, "FAIL");
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

test("uses the selected Miner's declared nested signal mapping", () => {
  const intent = "CVE_LOOKUP";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const result = toStrictVerificationRecord(
    intent,
    input,
    request,
    routed(intent, { assessment: { outcome: "NOT_AFFECTED", certainty: 0.94 } }),
    1,
    { labelField: "assessment.outcome", confidenceField: "assessment.certainty" },
  );
  assert.equal(result.verdict, "PASS");
  assert.equal(result.confidence, 0.94);
  assert.ok(result.warnings.includes("NORMALIZATION_DECLARED_MAPPING"));
});

test("interprets mapped booleans according to their field semantics", () => {
  const intent = "SSL_VERIFICATION";
  const request = buildSecureDeliveryIntentQuestion(intent, input);
  const result = toStrictVerificationRecord(
    intent,
    input,
    request,
    routed(intent, { certificate: { valid: true }, certainty: 0.91 }),
    1,
    { labelField: "certificate.valid", confidenceField: "certainty" },
  );
  assert.equal(result.verdict, "PASS");
  assert.equal(result.confidence, 0.91);
});
