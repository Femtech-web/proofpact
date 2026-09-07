import type { JsonValue } from "@/shared/json/canonical-json";
import { sha256Hex } from "@/shared/json/canonical-json";
import type { TelegraphEngineResult } from "@/infrastructure/telegraph/engine-client";
import type { MinerSignalMapping } from "@/infrastructure/telegraph/miner-signal-map";
import { normalizeRoutedResult, type NormalizedRoutedResult } from "./routed-result-normalizer";
import { captureResponseEvidence, type ResponseEvidence } from "./response-evidence";

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
  responseEvidence: ResponseEvidence;
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
    query: [
      "FRAUD_DETECTION: Assess this secure-software-delivery claim for fraud, impersonation, fabricated delivery, manipulated evidence, or material deception.",
      `Repository: ${value.repositoryUrl}`,
      `Commit: ${value.commitSha}`,
      `Deployment: ${value.deploymentUrl}`,
      `Worker claim: ${value.claimedRemediation}`,
      `Requester: ${value.requesterAddress.toLowerCase()}`,
      `Worker: ${value.workerAddress.toLowerCase()}`,
      `Reward: ${value.rewardUsdc} USDC`,
      "Return JSON with verdict PASS, FAIL, or INCONCLUSIVE; confidence from 0 to 1; and a concise evidence-based reason. Use INCONCLUSIVE when the supplied evidence cannot support a decision.",
    ].join("\n"),
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
  mapping?: MinerSignalMapping,
  normalizedResult?: NormalizedRoutedResult,
): FraudVerificationRecord {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
    throw new TypeError("attemptNumber must be between 1 and 3");
  }
  const normalized = normalizedResult ?? normalizeRoutedResult("FRAUD_DETECTION", result.result, mapping);
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
    responseEvidence: captureResponseEvidence(result.result),
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    observedAt: result.timestamp,
    ...(result.paymentReceipt?.transaction ? { paymentReference: result.paymentReceipt.transaction } : {}),
    ...(result.paymentReceipt ? { paymentResponseHash: result.paymentReceipt.headerHash } : {}),
    warnings: Object.freeze([...result.warnings, `NORMALIZATION_${normalized.normalization}`]),
  });
}
