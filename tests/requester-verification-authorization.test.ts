import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRequesterVerificationMessage,
  normalizeRequesterVerificationAuthorization,
} from "../features/verification/domain/requester-verification-authorization";

const authorization = {
  pactId: "29902dbb-6586-4044-83aa-d75f7720b1dd",
  submissionId: "7dd8a720-ebdc-40f1-96a9-da10056205ef",
  artifactHash: "0xd79ab1c03a6c6029bb89a1414faec4e3aa4272f7d4c897c1abdf67755d72d40e" as const,
  intents: ["FRAUD_DETECTION", "URL_SCAN", "SSL_VERIFICATION"] as const,
  maxCostUsdc: 0.12,
  nonce: "verification-authorization-1",
  deadline: 1_900_000_000,
};

test("requester authorization binds the exact submission, artifact, intents, ceiling, and chain", () => {
  const message = buildRequesterVerificationMessage(authorization);
  assert.match(message, new RegExp(authorization.pactId));
  assert.match(message, new RegExp(authorization.submissionId));
  assert.match(message, new RegExp(authorization.artifactHash));
  assert.match(message, /FRAUD_DETECTION, URL_SCAN, SSL_VERIFICATION/);
  assert.match(message, /Maximum Telegraph cost: 0\.12 USDC/);
  assert.match(message, /Base Sepolia \(84532\)/);
  assert.match(message, /does not release escrow/);
});

test("requester authorization rejects a changed or larger cost ceiling", () => {
  assert.throws(
    () => normalizeRequesterVerificationAuthorization({ ...authorization, maxCostUsdc: 0.13 }),
    /fixed 0\.12 USDC ceiling/,
  );
});

test("requester authorization rejects malformed artifact commitments", () => {
  assert.throws(
    () => normalizeRequesterVerificationAuthorization({ ...authorization, artifactHash: "0x1234" }),
    /artifact hash is invalid/,
  );
});

test("requester authorization rejects duplicate route selection", () => {
  assert.throws(
    () => normalizeRequesterVerificationAuthorization({ ...authorization, intents: ["FRAUD_DETECTION", "FACT_CHECK", "FACT_CHECK"] }),
    /three or four distinct policy intents/,
  );
});
