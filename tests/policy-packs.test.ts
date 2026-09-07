import assert from "node:assert/strict";
import test from "node:test";
import { POLICY_PACKS } from "../features/policies/domain/policy-pack";
import {
  normalizePolicyWorkerSubmission,
  policySubmissionArtifactHash,
} from "../features/jobs/domain/policy-worker-submission";
import { buildGenericPolicyRequestSet } from "../features/verification/application/policy-verification";
import { evaluateSettlement } from "../features/settlement/domain/evaluate-settlement";
import type { GenericPolicyVerificationInput } from "../features/verification/application/policy-verification";

for (const pack of POLICY_PACKS.filter((candidate) => candidate.id !== "secure-delivery")) {
  test(`${pack.name} has a strict evidence schema, request adapter, and release policy`, () => {
    const evidence = Object.fromEntries(pack.evidenceFields.map((field, index) => [field.key, `https://evidence.example/${pack.id}/${index}`]));
    const submission = normalizePolicyWorkerSubmission({
      pactId: "pact-12345678",
      policyPackId: pack.id,
      evidence,
      claimedOutcome: `Completed the ${pack.name} milestone with public evidence and reproducible results.`,
      nonce: "nonce-12345678",
      deadline: 2_000_000_000,
    });
    const input: GenericPolicyVerificationInput = {
      pactId: submission.pactId,
      requesterAddress: `0x${"1".repeat(40)}` as const,
      workerAddress: `0x${"2".repeat(40)}` as const,
      rewardUsdc: 10,
      policyPackId: pack.id as GenericPolicyVerificationInput["policyPackId"],
      policyVersion: pack.version,
      acceptanceCriteria: `The ${pack.name} work must be inspectable and satisfy the documented milestone.`,
      evidence: submission.evidence,
      claimedOutcome: submission.claimedOutcome,
    };
    const requests = buildGenericPolicyRequestSet(input);
    assert.deepEqual(requests.map((request) => request.intent), [...pack.requiredIntents]);
    assert.equal(new Set(requests.map((request) => request.artifactHash)).size, 1);
    assert.equal(requests[0]?.artifactHash, policySubmissionArtifactHash(submission));

    const signals = requests.map((request, index) => ({
      intent: request.intent,
      minerId: `miner-${index}`,
      signalHash: `0x${String(index + 1).padStart(64, "0")}` as `0x${string}`,
      verdict: "PASS" as const,
      confidence: 0.9,
      observedAt: "2026-09-07T00:00:00.000Z",
    }));
    assert.equal(evaluateSettlement(signals, pack.id).decision, "RELEASE");
    assert.equal(evaluateSettlement(signals.slice(1), pack.id).decision, "RETRY");
  });

  test(`${pack.name} rejects credential-bearing or non-HTTPS evidence`, () => {
    const evidence = Object.fromEntries(pack.evidenceFields.map((field) => [field.key, "https://evidence.example/item"]));
    evidence[pack.evidenceFields[0]!.key] = "http://user:secret@evidence.example/item";
    assert.throws(() => normalizePolicyWorkerSubmission({
      pactId: "pact-12345678",
      policyPackId: pack.id,
      evidence,
      claimedOutcome: "Completed work with sufficient public and independently inspectable evidence.",
      nonce: "nonce-12345678",
      deadline: 2_000_000_000,
    }), /public HTTPS URL/);
  });
}
