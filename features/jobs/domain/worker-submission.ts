export type WorkerSubmissionFields = Readonly<{
  pactId: string;
  repositoryUrl: string;
  commitSha: string;
  deploymentUrl: string;
  claimedRemediation: string;
  nonce: string;
  deadline: number;
}>;

const COMMIT = /^[0-9a-fA-F]{7,64}$/;
const NONCE = /^[0-9a-zA-Z-]{8,100}$/;

function httpsUrl(value: string, field: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new TypeError(`${field} must use HTTPS`);
  if (url.username || url.password) throw new TypeError(`${field} must not contain credentials`);
  url.hash = "";
  return url.toString();
}

export function normalizeWorkerSubmission(input: WorkerSubmissionFields): WorkerSubmissionFields {
  const pactId = input.pactId.trim();
  const commitSha = input.commitSha.trim().toLowerCase();
  const claimedRemediation = input.claimedRemediation.trim();
  const nonce = input.nonce.trim();
  if (!pactId || pactId.length > 128) throw new TypeError("pactId is required");
  if (!COMMIT.test(commitSha)) throw new TypeError("commit SHA must contain 7-64 hexadecimal characters");
  if (claimedRemediation.length < 20 || claimedRemediation.length > 2_000) {
    throw new TypeError("remediation claim must contain 20-2,000 characters");
  }
  if (!NONCE.test(nonce)) throw new TypeError("submission nonce is invalid");
  if (!Number.isSafeInteger(input.deadline) || input.deadline < 1 || input.deadline > 2 ** 48 - 1) {
    throw new TypeError("submission deadline is invalid");
  }
  return Object.freeze({
    pactId,
    repositoryUrl: httpsUrl(input.repositoryUrl, "repository URL"),
    commitSha,
    deploymentUrl: httpsUrl(input.deploymentUrl, "deployment URL"),
    claimedRemediation,
    nonce,
    deadline: input.deadline,
  });
}

export function buildWorkerSubmissionMessage(input: WorkerSubmissionFields): string {
  const value = normalizeWorkerSubmission(input);
  return [
    "ProofPact Secure Delivery Submission",
    "",
    `Pact: ${value.pactId}`,
    `Repository: ${value.repositoryUrl}`,
    `Commit: ${value.commitSha}`,
    `Deployment: ${value.deploymentUrl}`,
    `Remediation: ${value.claimedRemediation}`,
    `Nonce: ${value.nonce}`,
    `Deadline: ${value.deadline}`,
    "Chain: Base Sepolia (84532)",
    "",
    "Signing submits evidence for verification. It does not release escrow.",
  ].join("\n");
}
