import assert from "node:assert/strict";
import test from "node:test";
import { captureResponseEvidence } from "../features/verification/application/response-evidence";

test("captures bounded response evidence while redacting sensitive fields", () => {
  const result = captureResponseEvidence({ verdict: "PASS", nested: { api_token: "secret", reason: "valid" } });
  assert.equal(result.status, "CAPTURED");
  if (result.status !== "CAPTURED") return;
  assert.deepEqual(result.value, { verdict: "PASS", nested: { api_token: "[REDACTED]", reason: "valid" } });
});

test("omits oversized response bodies from the receipt", () => {
  const result = captureResponseEvidence({ answer: "x".repeat(30_000) });
  assert.equal(result.status, "OMITTED_OVERSIZED");
  assert.ok(result.byteLength > 24 * 1024);
  if (result.status !== "OMITTED_OVERSIZED") return;
  assert.ok(result.redactedPreview.length < 8_000);
  assert.match(result.redactedPreview, /bounded middle omitted/);
});
