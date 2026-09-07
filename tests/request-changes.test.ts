import assert from "node:assert/strict";
import test from "node:test";
import { buildRequestChangesMessage, normalizeRequestChanges } from "../features/jobs/domain/request-changes";

const request = {
  pactId: "29902dbb-6586-4044-83aa-d75f7720b1dd",
  submissionId: "f6332f1a-cb2d-40bd-bc23-74ce5234cc45",
  feedback: "Add the missing deployment evidence and explain the corrected behavior.",
  nonce: "change-request-1234",
  deadline: 2_000_000_000,
};

test("change-request signature binds feedback to one pact and submission", () => {
  const message = buildRequestChangesMessage(request);
  assert.match(message, new RegExp(request.pactId));
  assert.match(message, new RegExp(request.submissionId));
  assert.match(message, /Add the missing deployment evidence/);
  assert.match(message, /does not move escrow funds/);
});

test("change requests reject empty or unbounded feedback", () => {
  assert.throws(() => normalizeRequestChanges({ ...request, feedback: "Too short" }), /10-2,000/);
  assert.throws(() => normalizeRequestChanges({ ...request, feedback: "x".repeat(2_001) }), /10-2,000/);
});
