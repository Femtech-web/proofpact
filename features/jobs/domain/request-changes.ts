export type RequestChangesAuthorization = Readonly<{
  pactId: string;
  submissionId: string;
  feedback: string;
  nonce: string;
  deadline: number;
}>;

export function normalizeRequestChanges(value: RequestChangesAuthorization): RequestChangesAuthorization {
  const pactId = value.pactId.trim();
  const submissionId = value.submissionId.trim();
  const feedback = value.feedback.trim();
  const nonce = value.nonce.trim();
  if (!pactId || !submissionId) throw new TypeError("pact and submission are required");
  if (feedback.length < 10 || feedback.length > 2_000) throw new TypeError("feedback must contain 10-2,000 characters");
  if (!/^[0-9a-zA-Z-]{8,100}$/.test(nonce)) throw new TypeError("request nonce is invalid");
  if (!Number.isSafeInteger(value.deadline) || value.deadline < 1 || value.deadline > 2 ** 48 - 1) throw new TypeError("request deadline is invalid");
  return Object.freeze({ pactId, submissionId, feedback, nonce, deadline: value.deadline });
}

export function buildRequestChangesMessage(value: RequestChangesAuthorization): string {
  const request = normalizeRequestChanges(value);
  return [
    "ProofPact Request Changes",
    "",
    `Pact: ${request.pactId}`,
    `Submission: ${request.submissionId}`,
    `Feedback: ${request.feedback}`,
    `Nonce: ${request.nonce}`,
    `Deadline: ${request.deadline}`,
    "Chain: Base Sepolia (84532)",
    "",
    "Signing returns this delivery to the worker. It does not move escrow funds.",
  ].join("\n");
}
