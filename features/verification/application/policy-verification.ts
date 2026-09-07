import type { Pact, Submission } from "@/features/jobs/application/pact-store";
import { getPolicyPack, type PolicyPackId } from "@/features/policies/domain/policy-pack";
import { policySubmissionArtifactHash } from "@/features/jobs/domain/policy-worker-submission";
import type { TelegraphEngineResult, TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import type { MinerSignalMapping } from "@/infrastructure/telegraph/miner-signal-map";
import { canonicalJson, sha256Hex, type JsonValue } from "@/shared/json/canonical-json";
import { captureResponseEvidence, type ResponseEvidence } from "./response-evidence";
import { normalizeRoutedResult, type NormalizedRoutedResult } from "./routed-result-normalizer";

export type GenericPolicyVerificationInput = Readonly<{
  pactId: string;
  requesterAddress: `0x${string}`;
  workerAddress: `0x${string}`;
  rewardUsdc: number;
  policyPackId: Exclude<PolicyPackId, "secure-delivery">;
  policyVersion: string;
  acceptanceCriteria: string;
  evidence: Readonly<Record<string, string>>;
  claimedOutcome: string;
}>;

export type GenericPolicyVerificationRecord = Readonly<{
  pactId: string;
  attemptNumber: number;
  intent: TelegraphIntent;
  queryHash: `0x${string}`;
  artifactHash: `0x${string}`;
  minerId: string;
  minerName: string;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  confidence: number;
  signalHash: `0x${string}`;
  rawResponseHash: `0x${string}`;
  responseEvidence: ResponseEvidence;
  costUsd: number;
  durationMs: number;
  observedAt: string;
  paymentReference?: string;
  paymentResponseHash?: `0x${string}`;
  warnings: readonly string[];
}>;

export type GenericPolicyRequest = Readonly<{
  intent: TelegraphIntent;
  query: string;
  context: JsonValue;
  artifactHash: `0x${string}`;
}>;

function evidenceRecord(value: JsonValue): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("submission evidence must be an object");
  return value as Record<string, unknown>;
}

export function genericPolicyInputFromSubmission(pact: Pact, submission: Submission): GenericPolicyVerificationInput {
  const pack = getPolicyPack(pact.policyPackId);
  if (pack.id === "secure-delivery") throw new TypeError("Secure Delivery uses its dedicated evidence adapter");
  const stored = evidenceRecord(submission.evidence);
  const evidence = Object.fromEntries(pack.evidenceFields.map((field) => {
    const value = stored[field.key];
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`Missing ${field.label}`);
    return [field.key, value.trim()];
  }));
  const input = Object.freeze({
    pactId: pact.id,
    requesterAddress: pact.requesterAddress,
    workerAddress: pact.workerAddress,
    rewardUsdc: Number(pact.rewardUsdc),
    policyPackId: pack.id,
    policyVersion: pact.policyVersion,
    acceptanceCriteria: pact.acceptanceCriteria,
    evidence: Object.freeze(evidence),
    claimedOutcome: submission.claimedRemediation,
  });
  if (policySubmissionArtifactHash(input) !== submission.artifactHash) {
    throw new TypeError("Submission artifact commitment does not match its policy evidence");
  }
  return input;
}

function question(intent: TelegraphIntent, input: GenericPolicyVerificationInput): string {
  const pack = getPolicyPack(input.policyPackId);
  const evidence = canonicalJson(input.evidence as JsonValue);
  const instruction = intent === "FRAUD_DETECTION"
    ? "Assess the evidence and outcome claim for fabrication, impersonation, manipulated results, or material deception."
    : intent === "FACT_CHECK"
      ? "Check whether the factual outcome claim is supported by the linked public evidence."
      : intent === "AGENT_TASK"
        ? "Evaluate whether the delivered work satisfies the stated acceptance criteria, not merely whether an artifact exists."
        : intent === "URL_SCAN"
          ? "Inspect the primary delivered URL for phishing, malware, deceptive redirects, or unsafe content."
          : "Verify the primary delivered URL's live TLS certificate, hostname, validity window, and trust chain.";
  return [
    `${intent}: ${instruction}`,
    `Policy pack: ${pack.name} (${pack.version})`,
    `Acceptance criteria: ${input.acceptanceCriteria}`,
    `Worker outcome claim: ${input.claimedOutcome}`,
    `Public evidence: ${evidence}`,
    `Requester: ${input.requesterAddress}`,
    `Worker: ${input.workerAddress}`,
    `Reward: ${input.rewardUsdc} USDC`,
    "Return JSON with verdict PASS, FAIL, or INCONCLUSIVE; confidence from 0 to 1; and a concise evidence-based reason. PASS requires inspectable support, and unavailable evidence must be INCONCLUSIVE.",
  ].join("\n");
}

export function buildGenericPolicyRequestSet(input: GenericPolicyVerificationInput): readonly GenericPolicyRequest[] {
  const pack = getPolicyPack(input.policyPackId);
  const artifactHash = policySubmissionArtifactHash(input);
  const context = {
    pact_id: input.pactId,
    policy_pack: pack.id,
    policy_version: pack.version,
    acceptance_criteria: input.acceptanceCriteria,
    evidence: input.evidence,
    claimed_outcome: input.claimedOutcome,
    artifact_hash: artifactHash,
  } satisfies JsonValue;
  return Object.freeze(pack.requiredIntents.map((intent) => Object.freeze({
    intent,
    query: question(intent, input),
    context,
    artifactHash,
  })));
}

export function toGenericPolicyVerificationRecord(
  input: GenericPolicyVerificationInput,
  request: GenericPolicyRequest,
  result: TelegraphEngineResult,
  attemptNumber: number,
  mapping?: MinerSignalMapping,
  normalizedResult?: NormalizedRoutedResult,
): GenericPolicyVerificationRecord {
  if (result.intent !== request.intent) throw new TypeError(`Expected ${request.intent} result but received ${result.intent}`);
  const normalized = normalizedResult ?? normalizeRoutedResult(request.intent, result.result, mapping);
  return Object.freeze({
    pactId: input.pactId,
    attemptNumber,
    intent: request.intent,
    queryHash: sha256Hex({ query: request.query, context: request.context }),
    artifactHash: request.artifactHash,
    minerId: result.minerId,
    minerName: result.minerName,
    verdict: normalized.verdict,
    confidence: normalized.confidence,
    signalHash: result.signalHash,
    rawResponseHash: result.rawResponseHash,
    responseEvidence: captureResponseEvidence(result.result),
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    observedAt: result.timestamp,
    ...(result.paymentReceipt?.transaction ? { paymentReference: result.paymentReceipt.transaction } : {}),
    ...(result.paymentReceipt ? { paymentResponseHash: result.paymentReceipt.headerHash } : {}),
    warnings: Object.freeze([...result.warnings, `NORMALIZATION_${normalized.normalization}`]),
  });
}
