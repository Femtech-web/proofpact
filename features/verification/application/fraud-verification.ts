import type { JsonValue } from "@/shared/json/canonical-json";
import { sha256Hex } from "@/shared/json/canonical-json";
import type { TelegraphEngineResult } from "@/infrastructure/telegraph/engine-client";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const COMMIT = /^[0-9a-fA-F]{7,64}$/;

export type SecureDeliveryFraudInput = Readonly<{
  pactId: string;
  requesterAddress: `0x${string}`;
  workerAddress: `0x${string}`;
  rewardUsdc: number;
  repositoryUrl: string;
  commitSha: string;
  deploymentUrl: string;
  claimedRemediation: string;
}>;

export type FraudVerificationRecord = Readonly<{
  pactId: string;
  attemptNumber: number;
  intent: "FRAUD_DETECTION";
  queryHash: `0x${string}`;
  artifactHash: `0x${string}`;
  minerId: string;
  minerName: string;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  confidence: number;
  signalHash: `0x${string}`;
  rawResponseHash: `0x${string}`;
  costUsd: number;
  durationMs: number;
  observedAt: string;
  paymentReference?: string;
  paymentResponseHash?: `0x${string}`;
  warnings: readonly string[];
}>;

function httpsUrl(value: string, field: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new TypeError(`${field} must use HTTPS`);
  url.username = "";
  url.password = "";
  return url.toString();
}

function validateInput(input: SecureDeliveryFraudInput): SecureDeliveryFraudInput {
  if (!input.pactId.trim() || input.pactId.length > 128) throw new TypeError("pactId is required and must be at most 128 characters");
  if (!ADDRESS.test(input.requesterAddress) || !ADDRESS.test(input.workerAddress)) throw new TypeError("requester and worker must be EVM addresses");
  if (!Number.isFinite(input.rewardUsdc) || input.rewardUsdc <= 0 || input.rewardUsdc > 1_000_000) throw new TypeError("rewardUsdc is outside the supported range");
  if (!COMMIT.test(input.commitSha)) throw new TypeError("commitSha must be a 7-64 character hexadecimal commit identifier");
  if (!input.claimedRemediation.trim() || input.claimedRemediation.length > 2_000) throw new TypeError("claimedRemediation is required and must be at most 2,000 characters");
  return Object.freeze({
    ...input,
    pactId: input.pactId.trim(),
    repositoryUrl: httpsUrl(input.repositoryUrl, "repositoryUrl"),
    deploymentUrl: httpsUrl(input.deploymentUrl, "deploymentUrl"),
    commitSha: input.commitSha.toLowerCase(),
    claimedRemediation: input.claimedRemediation.trim(),
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function normalizeFraudResult(result: JsonValue): { verdict: FraudVerificationRecord["verdict"]; confidence: number } {
  const outer = record(result);
  const payload = record(outer?.signal) ?? outer;
  if (!payload) return { verdict: "INCONCLUSIVE", confidence: 0 };

  const confidence = typeof payload.confidence === "number"
    && Number.isFinite(payload.confidence)
    && payload.confidence >= 0
    && payload.confidence <= 1
    ? payload.confidence
    : 0;
  const rawVerdict = payload.verdict ?? payload.gate_decision ?? payload.risk_level;
  if (typeof payload.fraudulent === "boolean") {
    return { verdict: payload.fraudulent ? "FAIL" : "PASS", confidence };
  }
  if (typeof rawVerdict !== "string") return { verdict: "INCONCLUSIVE", confidence };
  const verdict = rawVerdict.trim().toUpperCase();
  if (["ALLOW", "PASS", "SAFE", "BENIGN", "LEGITIMATE", "LOW"].includes(verdict)) return { verdict: "PASS", confidence };
  if (["BLOCK", "FAIL", "FRAUD", "FRAUDULENT", "MALICIOUS", "HIGH", "CRITICAL"].includes(verdict)) return { verdict: "FAIL", confidence };
  return { verdict: "INCONCLUSIVE", confidence };
}

export function buildFraudQuestion(input: SecureDeliveryFraudInput): {
  readonly query: string;
  readonly context: JsonValue;
  readonly artifactHash: `0x${string}`;
} {
  const value = validateInput(input);
  const artifact = {
    repository_url: value.repositoryUrl,
    commit_sha: value.commitSha,
    deployment_url: value.deploymentUrl,
    claimed_remediation: value.claimedRemediation,
  };
  const artifactHash = sha256Hex(artifact);
  return Object.freeze({
    query: "FRAUD_DETECTION: Assess whether this secure-software-delivery pact, counterparty, payment context, and submitted evidence show fraud, impersonation, fabricated delivery, manipulated evidence, or other material deception. Return a structured verdict and confidence. Abstain when evidence is insufficient.",
    context: {
      pact_id: value.pactId,
      requester_address: value.requesterAddress.toLowerCase(),
      worker_address: value.workerAddress.toLowerCase(),
      reward_usdc: value.rewardUsdc,
      policy_pack: "secure-delivery",
      policy_version: "DELIVERY_V1",
      artifact,
      artifact_hash: artifactHash,
    },
    artifactHash,
  });
}

export function toFraudVerificationRecord(
  input: SecureDeliveryFraudInput,
  request: ReturnType<typeof buildFraudQuestion>,
  result: TelegraphEngineResult,
  attemptNumber = 1,
): FraudVerificationRecord {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
    throw new TypeError("attemptNumber must be between 1 and 3");
  }
  const normalized = normalizeFraudResult(result.result);
  return Object.freeze({
    pactId: input.pactId.trim(),
    attemptNumber,
    intent: "FRAUD_DETECTION",
    queryHash: sha256Hex({ query: request.query, context: request.context }),
    artifactHash: request.artifactHash,
    minerId: result.minerId,
    minerName: result.minerName,
    verdict: normalized.verdict,
    confidence: normalized.confidence,
    signalHash: result.signalHash,
    rawResponseHash: result.rawResponseHash,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    observedAt: result.timestamp,
    ...(result.paymentReceipt?.transaction ? { paymentReference: result.paymentReceipt.transaction } : {}),
    ...(result.paymentReceipt ? { paymentResponseHash: result.paymentReceipt.headerHash } : {}),
    warnings: result.warnings,
  });
}
