import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRoutedResult } from "../features/verification/application/routed-result-normalizer";

test("keeps an in-progress SSL Labs assessment inconclusive", () => {
  assert.deepEqual(normalizeRoutedResult("SSL_VERIFICATION", {
    status: "DNS",
    statusMessage: "Resolving domain names",
  }), {
    verdict: "INCONCLUSIVE",
    confidence: 0,
    normalization: "STRICT_STRUCTURED",
  });
});

test("accepts a completed trusted SSL Labs grade", () => {
  assert.deepEqual(normalizeRoutedResult("SSL_VERIFICATION", {
    status: "READY",
    endpoints: [{ grade: "A" }],
  }), {
    verdict: "PASS",
    confidence: 0.9,
    normalization: "STRICT_STRUCTURED",
  });
});
