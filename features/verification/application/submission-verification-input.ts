import type { Pact, Submission } from "@/features/jobs/application/pact-store";
import { buildFraudQuestion, type SecureDeliveryFraudInput } from "./fraud-verification";
import { genericPolicyInputFromSubmission, type GenericPolicyVerificationInput } from "./policy-verification";

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

export type PactVerificationInput = SecureDeliveryFraudInput | GenericPolicyVerificationInput;

export function verificationInputFromSubmission(pact: Pact, submission: Submission): PactVerificationInput {
  if (pact.id !== submission.pactId) throw new TypeError("Submission does not belong to pact");
  if (pact.status !== "SUBMITTED" && pact.status !== "HELD") {
    throw new TypeError("Pact must be SUBMITTED or HELD for a verification retry");
  }
  if (submission.submittedBy.toLowerCase() !== pact.workerAddress.toLowerCase()) {
    throw new TypeError("Submission was not signed by the recorded worker");
  }
  if (pact.policyPackId !== "secure-delivery") return genericPolicyInputFromSubmission(pact, submission);
  const evidence = record(submission.evidence, "submission.evidence");
  const input: SecureDeliveryFraudInput = {
    pactId: pact.id,
    requesterAddress: pact.requesterAddress,
    workerAddress: pact.workerAddress,
    rewardUsdc: Number(pact.rewardUsdc),
    repositoryUrl: text(evidence.repository_url, "evidence.repository_url"),
    commitSha: text(evidence.commit_sha, "evidence.commit_sha"),
    deploymentUrl: text(evidence.deployment_url, "evidence.deployment_url"),
    claimedRemediation: submission.claimedRemediation,
  };
  const artifactHash = buildFraudQuestion(input).artifactHash;
  if (artifactHash !== submission.artifactHash) throw new TypeError("Submission artifact commitment does not match its evidence");
  return Object.freeze(input);
}
