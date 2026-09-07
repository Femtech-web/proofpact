import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkerSubmissionMessage, normalizeWorkerSubmission } from "../features/jobs/domain/worker-submission";

const input = {
  pactId: "29902dbb-6586-4044-83aa-d75f7720b1dd",
  repositoryUrl: "https://github.com/Femtech-web/commitra",
  commitSha: "ABCDEF1234567",
  deploymentUrl: "https://commitra.vercel.app",
  claimedRemediation: "Patched the vulnerable authentication flow and deployed the reviewed commit.",
  nonce: "submission-12345678",
  deadline: 2_000_000_000,
};

test("normalizes and visibly binds every worker submission field", () => {
  const normalized = normalizeWorkerSubmission(input);
  assert.equal(normalized.commitSha, "abcdef1234567");
  assert.equal(normalized.repositoryUrl, "https://github.com/Femtech-web/commitra");
  assert.equal(normalized.deploymentUrl, "https://commitra.vercel.app/");
  const message = buildWorkerSubmissionMessage(input);
  for (const value of [normalized.pactId, normalized.repositoryUrl, normalized.commitSha, normalized.deploymentUrl, normalized.claimedRemediation, normalized.nonce]) {
    assert.match(message, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(message, /does not release escrow/i);
});

test("rejects non-HTTPS, malformed commits, weak claims, and invalid deadlines", () => {
  assert.throws(() => normalizeWorkerSubmission({ ...input, repositoryUrl: "http://example.com" }));
  assert.throws(() => normalizeWorkerSubmission({ ...input, commitSha: "not-a-commit" }));
  assert.throws(() => normalizeWorkerSubmission({ ...input, claimedRemediation: "done" }));
  assert.throws(() => normalizeWorkerSubmission({ ...input, deadline: Number.NaN }));
});
