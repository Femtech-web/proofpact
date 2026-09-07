import type { VerificationIntent } from "./verification";

export type RequesterVerificationAuthorization = Readonly<{
  pactId: string;
  submissionId: string;
  artifactHash: `0x${string}`;
  intents: readonly VerificationIntent[];
  maxCostUsdc: number;
  nonce: string;
  deadline: number;
}>;

const ID = /^[0-9a-zA-Z-]{8,128}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const POLICY_INTENTS = new Set<VerificationIntent>([
  "FRAUD_DETECTION", "CVE_LOOKUP", "FACT_CHECK", "WEB_SEARCH", "CONTENT_EXTRACTION", "URL_SCAN", "SSL_VERIFICATION", "AGENT_TASK",
]);

export function normalizeRequesterVerificationAuthorization(
  input: RequesterVerificationAuthorization,
): RequesterVerificationAuthorization {
  const pactId = input.pactId.trim();
  const submissionId = input.submissionId.trim();
  const artifactHash = input.artifactHash.trim().toLowerCase() as `0x${string}`;
  const nonce = input.nonce.trim();
  const intents = [...input.intents];
  if (!ID.test(pactId)) throw new TypeError("pact ID is invalid");
  if (!ID.test(submissionId)) throw new TypeError("submission ID is invalid");
  if (!HASH.test(artifactHash)) throw new TypeError("artifact hash is invalid");
  if (!ID.test(nonce)) throw new TypeError("authorization nonce is invalid");
  if (intents.length < 3 || intents.length > 4 || new Set(intents).size !== intents.length
    || intents.some((intent) => !POLICY_INTENTS.has(intent))
    || !intents.includes("FRAUD_DETECTION")) {
    throw new TypeError("authorization must bind three or four distinct policy intents including FRAUD_DETECTION");
  }
  if (!Number.isSafeInteger(input.deadline) || input.deadline < 1 || input.deadline > 2 ** 48 - 1) {
    throw new TypeError("authorization deadline is invalid");
  }
  if (!Number.isFinite(input.maxCostUsdc) || input.maxCostUsdc !== 0.12) {
    throw new TypeError("Policy verification must use the fixed 0.12 USDC ceiling");
  }
  return Object.freeze({ pactId, submissionId, artifactHash, intents: Object.freeze(intents), maxCostUsdc: input.maxCostUsdc, nonce, deadline: input.deadline });
}

export function buildRequesterVerificationMessage(input: RequesterVerificationAuthorization): string {
  const value = normalizeRequesterVerificationAuthorization(input);
  return [
    "ProofPact Policy Verification",
    "",
    `Pact: ${value.pactId}`,
    `Submission: ${value.submissionId}`,
    `Artifact: ${value.artifactHash}`,
    `Intents: ${value.intents.join(", ")}`,
    `Maximum Telegraph cost: ${value.maxCostUsdc.toFixed(2)} USDC`,
    `Nonce: ${value.nonce}`,
    `Deadline: ${value.deadline}`,
    "Chain: Base Sepolia (84532)",
    "",
    "Signing authorizes this bounded verification only. It does not release escrow.",
  ].join("\n");
}
