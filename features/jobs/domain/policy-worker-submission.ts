import { getPolicyPack, type PolicyPackId } from "@/features/policies/domain/policy-pack";
import { canonicalJson, sha256Hex, type JsonValue } from "@/shared/json/canonical-json";

export type PolicyWorkerSubmissionFields = Readonly<{
  pactId: string;
  policyPackId: PolicyPackId;
  evidence: Readonly<Record<string, string>>;
  claimedOutcome: string;
  nonce: string;
  deadline: number;
}>;

const NONCE = /^[0-9a-zA-Z-]{8,100}$/;
const COMMIT = /^[0-9a-fA-F]{7,64}$/;

function publicHttpsUrl(value: string, field: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new TypeError(`${field} must be a public HTTPS URL without credentials`);
  }
  url.hash = "";
  return url.toString();
}

export function normalizePolicyWorkerSubmission(input: PolicyWorkerSubmissionFields): PolicyWorkerSubmissionFields {
  const pactId = input.pactId.trim();
  const pack = getPolicyPack(input.policyPackId);
  const claimedOutcome = input.claimedOutcome.trim();
  const nonce = input.nonce.trim();
  if (!pactId || pactId.length > 128) throw new TypeError("pactId is required");
  if (claimedOutcome.length < 20 || claimedOutcome.length > 2_000) {
    throw new TypeError("outcome claim must contain 20-2,000 characters");
  }
  if (!NONCE.test(nonce)) throw new TypeError("submission nonce is invalid");
  if (!Number.isSafeInteger(input.deadline) || input.deadline < 1 || input.deadline > 2 ** 48 - 1) {
    throw new TypeError("submission deadline is invalid");
  }
  const evidence = Object.fromEntries(pack.evidenceFields.map((definition) => {
    const raw = input.evidence[definition.key]?.trim() ?? "";
    if (definition.key === "commit_sha") {
      if (!COMMIT.test(raw)) throw new TypeError("commit SHA must contain 7-64 hexadecimal characters");
      return [definition.key, raw.toLowerCase()];
    }
    return [definition.key, publicHttpsUrl(raw, definition.label)];
  }));
  return Object.freeze({
    pactId,
    policyPackId: pack.id,
    evidence: Object.freeze(evidence),
    claimedOutcome,
    nonce,
    deadline: input.deadline,
  });
}

export function policySubmissionArtifactHash(input: Pick<PolicyWorkerSubmissionFields, "policyPackId" | "evidence" | "claimedOutcome">): `0x${string}` {
  const pack = getPolicyPack(input.policyPackId);
  if (pack.id === "secure-delivery") {
    return sha256Hex({
      repository_url: input.evidence.repository_url,
      commit_sha: input.evidence.commit_sha,
      deployment_url: input.evidence.deployment_url,
      claimed_remediation: input.claimedOutcome,
    });
  }
  return sha256Hex({ policy_pack: pack.id, evidence: input.evidence as JsonValue, claimed_outcome: input.claimedOutcome });
}

export function buildPolicyWorkerSubmissionMessage(input: PolicyWorkerSubmissionFields): string {
  const value = normalizePolicyWorkerSubmission(input);
  const pack = getPolicyPack(value.policyPackId);
  return [
    "ProofPact Worker Evidence Submission",
    "",
    `Pact: ${value.pactId}`,
    `Policy: ${pack.id} / ${pack.version}`,
    `Evidence: ${canonicalJson(value.evidence as JsonValue)}`,
    `Outcome claim: ${value.claimedOutcome}`,
    `Nonce: ${value.nonce}`,
    `Deadline: ${value.deadline}`,
    "Chain: Base Sepolia (84532)",
    "",
    "Signing submits evidence for verification. It does not release escrow.",
  ].join("\n");
}
