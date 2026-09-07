import assert from "node:assert/strict";
import test from "node:test";
import { buildSecureDeliveryRequestSet } from "../features/verification/application/secure-delivery-request-set";
import { verificationInputFromSubmission } from "../features/verification/application/submission-verification-input";
import { preflightSecureDelivery } from "../infrastructure/telegraph/preflight-secure-delivery";
import type { Pact, Submission } from "../features/jobs/application/pact-store";

const input = {
  pactId: "29902dbb-6586-4044-83aa-d75f7720b1dd",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  rewardUsdc: 0.01,
  repositoryUrl: "https://github.com/example/project",
  commitSha: "abcdef1234567",
  deploymentUrl: "https://example.com/",
  claimedRemediation: "Submitted the reviewed fix for independent verification.",
} as const;

function challenge(amount = "10000"): string {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount,
      payTo: "0x3333333333333333333333333333333333333333",
      maxTimeoutSeconds: 60,
    }],
  })).toString("base64");
}

test("uses three Telegraph checks after direct source provenance", () => {
  const requests = buildSecureDeliveryRequestSet(input);
  assert.deepEqual(requests.map((request) => request.intent), ["FRAUD_DETECTION", "URL_SCAN", "SSL_VERIFICATION"]);
  assert.equal(new Set(requests.map((request) => request.artifactHash)).size, 1);
});

test("derives verification input only from matching committed worker evidence", () => {
  const artifactHash = buildSecureDeliveryRequestSet(input)[0]!.artifactHash;
  const pact = {
    id: input.pactId, requesterAddress: input.requesterAddress, workerAddress: input.workerAddress,
    policyPackId: "secure-delivery", policyVersion: "DELIVERY_V1", title: "Test",
    acceptanceCriteria: "A complete verifiable delivery.", rewardUsdc: "0.01", chainId: 84532,
    status: "SUBMITTED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } satisfies Pact;
  const submission = {
    id: "submission", pactId: pact.id, sequence: 1, submittedBy: pact.workerAddress, artifactHash,
    evidence: { repository_url: input.repositoryUrl, commit_sha: input.commitSha, deployment_url: input.deploymentUrl },
    claimedRemediation: input.claimedRemediation, createdAt: new Date().toISOString(),
  } satisfies Submission;
  assert.deepEqual(verificationInputFromSubmission(pact, submission), input);
  assert.deepEqual(verificationInputFromSubmission({ ...pact, status: "HELD" }, submission), input);
  assert.throws(() => verificationInputFromSubmission({ ...pact, workerAddress: input.requesterAddress }, submission), /recorded worker/);
});

test("validates direct source proof and three unpaid challenges", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({
      sha: input.commitSha,
      html_url: `${input.repositoryUrl}/commit/${input.commitSha}`,
      commit: { message: "Submitted reviewed fix" },
      files: [{ filename: "fix.ts", patch: "independent verification reviewed fix" }],
    }), { status: 200 });
    return new Response(null, { status: 402, headers: { "payment-required": challenge() } });
  };
  const result = await preflightSecureDelivery({
    input,
    nodeUrl: "https://engine.example.com",
    maxCostUsdcPerIntent: 0.05,
    maxTotalCostUsdc: 0.05,
    fetchImpl,
    signal: AbortSignal.timeout(1_000),
  });
  assert.equal(calls, 4);
  assert.equal(result.totalCostUsdc, 0.03);
  assert.equal(result.challenges.length, 3);
  assert.equal(result.sourceProof?.commitSha, input.commitSha);
  assert.ok(result.challenges.every((item) => item.payment.network === "eip155:84532"));
});
