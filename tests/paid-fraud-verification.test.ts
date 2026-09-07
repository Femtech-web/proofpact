import assert from "node:assert/strict";
import test from "node:test";
import type { FraudVerificationRecord, SecureDeliveryFraudInput } from "../features/verification/application/fraud-verification";
import { runPaidFraudVerification } from "../features/verification/application/run-paid-fraud-verification";
import { createInMemoryVerificationAttemptStore } from "../features/verification/application/verification-attempt-store";
import { TelegraphEngineError } from "../infrastructure/telegraph/engine-client";
import type { AuthorizedPayment } from "../infrastructure/x402/authorized-fetch";

const input: SecureDeliveryFraudInput = {
  pactId: "pact-retry",
  requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222",
  rewardUsdc: 800,
  repositoryUrl: "https://github.com/example/api",
  commitSha: "9f3c2a1",
  deploymentUrl: "https://api.example.com",
  claimedRemediation: "Patched the vulnerable route.",
};

const payment: AuthorizedPayment = {
  network: "eip155:84532",
  asset: "BASE_SEPOLIA_USDC",
  amountUsdc: 0.01,
  payTo: "0x3333333333333333333333333333333333333333",
  maxTimeoutSeconds: 60,
};

function routed(attemptNumber: number, minerId: string, minerName = `miner-${minerId}`): FraudVerificationRecord {
  return {
    pactId: input.pactId,
    attemptNumber,
    intent: "FRAUD_DETECTION",
    queryHash: `0x${"1".repeat(64)}`,
    artifactHash: `0x${"2".repeat(64)}`,
    minerId,
    minerName,
    verdict: "PASS",
    confidence: 0.92,
    signalHash: `0x${attemptNumber.toString(16).repeat(64).slice(0, 64)}`,
    rawResponseHash: `0x${"4".repeat(64)}`,
    responseEvidence: { status: "CAPTURED", byteLength: 18, value: { verdict: "PASS" } },
    costUsd: 0.01,
    durationMs: 100,
    observedAt: "2026-09-04T12:00:00.000Z",
    warnings: [],
  };
}

function stableIds() {
  let index = 0;
  return () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`;
}

test("retries bounded pre-authorization transport errors and persists every attempt", async () => {
  const store = createInMemoryVerificationAttemptStore();
  const delays: number[] = [];
  const result = await runPaidFraudVerification({
    runId: "run-pre-auth",
    input,
    maxAttempts: 3,
    requiredDistinctResults: 1,
    maxAuthorizedCostUsdc: 0.03,
    attemptStore: store,
    authorizePayment: () => true,
    retryDelayMs: ({ attemptNumber }) => attemptNumber * 10,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    createEventId: stableIds(),
    attempt: async ({ attemptNumber, authorizePayment }) => {
      if (attemptNumber === 1) throw new TelegraphEngineError("TRANSPORT_ERROR", "offline");
      assert.equal(await authorizePayment(payment), true);
      return routed(attemptNumber, "42");
    },
  });
  assert.equal(result.complete, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.authorizedCostUsdc, 0.01);
  assert.deepEqual(delays, [10]);
  assert.deepEqual(store.events.map((event) => event.type), ["STARTED", "FAILED", "STARTED", "PAYMENT_AUTHORIZED", "SUCCEEDED"]);
});

test("never retries an ambiguous error after payment authorization", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let attempts = 0;
  await assert.rejects(() => runPaidFraudVerification({
    runId: "run-ambiguous",
    input,
    maxAttempts: 3,
    requiredDistinctResults: 1,
    maxAuthorizedCostUsdc: 0.03,
    attemptStore: store,
    authorizePayment: () => true,
    createEventId: stableIds(),
    attempt: async ({ authorizePayment }) => {
      attempts += 1;
      assert.equal(await authorizePayment(payment), true);
      throw new TelegraphEngineError("TRANSPORT_ERROR", "response lost");
    },
  }), /response lost/);
  assert.equal(attempts, 1);
  const failed = store.events.find((event) => event.type === "FAILED");
  assert.equal(failed?.type === "FAILED" && failed.paymentState, "AUTHORIZED_AMBIGUOUS");
  assert.equal(failed?.type === "FAILED" && failed.retryable, false);
});

test("retries an ambiguous authorization only after reconciliation proves it expired unsettled", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let attempts = 0;
  const result = await runPaidFraudVerification({
    runId: "run-reconciled-unsettled",
    input,
    maxAttempts: 3,
    requiredDistinctResults: 1,
    maxAuthorizedCostUsdc: 0.03,
    attemptStore: store,
    authorizePayment: () => true,
    reconcileAuthorizedFailure: async ({ attemptNumber }) => ({
      state: "EXPIRED_UNSETTLED",
      evidence: { checkedThroughBlock: 1234, attemptNumber },
    }),
    createEventId: stableIds(),
    attempt: async ({ attemptNumber, authorizePayment }) => {
      attempts += 1;
      assert.equal(await authorizePayment(payment), true);
      if (attemptNumber === 1) throw new TelegraphEngineError("TRANSPORT_ERROR", "response lost");
      return routed(attemptNumber, "84");
    },
  });
  assert.equal(result.complete, true);
  assert.equal(attempts, 2);
  assert.equal(result.authorizedCostUsdc, 0.02);
  assert.deepEqual(store.events.map((event) => event.type), [
    "STARTED",
    "PAYMENT_AUTHORIZED",
    "FAILED",
    "PAYMENT_RECONCILED",
    "STARTED",
    "PAYMENT_AUTHORIZED",
    "SUCCEEDED",
  ]);
  const reconciliation = store.events.find((event) => event.type === "PAYMENT_RECONCILED");
  assert.equal(reconciliation?.type === "PAYMENT_RECONCILED" && reconciliation.retryPermitted, true);
});

test("does not retry when reconciliation finds settlement", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let attempts = 0;
  await assert.rejects(() => runPaidFraudVerification({
    runId: "run-reconciled-settled",
    input,
    maxAttempts: 3,
    requiredDistinctResults: 1,
    maxAuthorizedCostUsdc: 0.03,
    attemptStore: store,
    authorizePayment: () => true,
    reconcileAuthorizedFailure: async () => ({
      state: "SETTLED",
      evidence: { transactionHash: `0x${"a".repeat(64)}` },
    }),
    createEventId: stableIds(),
    attempt: async ({ authorizePayment }) => {
      attempts += 1;
      assert.equal(await authorizePayment(payment), true);
      throw new TelegraphEngineError("TRANSPORT_ERROR", "response lost");
    },
  }), /response lost/);
  assert.equal(attempts, 1);
  const reconciliation = store.events.find((event) => event.type === "PAYMENT_RECONCILED");
  assert.equal(reconciliation?.type === "PAYMENT_RECONCILED" && reconciliation.reconciliationState, "SETTLED");
  assert.equal(reconciliation?.type === "PAYMENT_RECONCILED" && reconciliation.retryPermitted, false);
});

test("retries only an explicitly unsuccessful settlement and accounts for later authority", async () => {
  const store = createInMemoryVerificationAttemptStore();
  const result = await runPaidFraudVerification({
    runId: "run-explicit-failure",
    input,
    maxAttempts: 2,
    requiredDistinctResults: 1,
    maxAuthorizedCostUsdc: 0.02,
    attemptStore: store,
    authorizePayment: () => true,
    createEventId: stableIds(),
    attempt: async ({ attemptNumber, authorizePayment }) => {
      assert.equal(await authorizePayment(payment), true);
      if (attemptNumber === 1) {
        throw new TelegraphEngineError("INVALID_RESPONSE", "payment failed", undefined, {
          bodyStatus: "CAPTURED",
          paymentResponsePresent: true,
          paymentSuccess: false,
          paymentError: "invalid_exact_evm_transaction_failed",
        });
      }
      return routed(attemptNumber, "43");
    },
  });
  assert.equal(result.authorizedCostUsdc, 0.02);
  assert.equal(result.settledCostUsdc, 0.01);
  const failed = store.events.find((event) => event.type === "FAILED");
  assert.equal(failed?.type === "FAILED" && failed.paymentState, "EXPLICITLY_UNSETTLED");
  assert.equal(failed?.type === "FAILED" && failed.retryable, true);
});

test("persists paid duplicate routes without counting them as independent", async () => {
  const store = createInMemoryVerificationAttemptStore();
  const miners = ["42", "42", "84"];
  const result = await runPaidFraudVerification({
    runId: "run-dedup",
    input,
    maxAttempts: 3,
    requiredDistinctResults: 2,
    maxAuthorizedCostUsdc: 0.03,
    attemptStore: store,
    authorizePayment: () => true,
    createEventId: stableIds(),
    attempt: async ({ attemptNumber, authorizePayment }) => {
      assert.equal(await authorizePayment(payment), true);
      return routed(attemptNumber, miners[attemptNumber - 1]!);
    },
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.records.map((record) => record.minerId), ["42", "84"]);
  assert.equal(result.authorizedCostUsdc, 0.03);
  assert.equal(result.settledCostUsdc, 0.03);
  assert.equal(store.events.filter((event) => event.type === "DUPLICATE").length, 1);
});

test("enforces the cumulative authorization cap across attempts", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let authorizerCalls = 0;
  await assert.rejects(() => runPaidFraudVerification({
    runId: "run-cost-cap",
    input,
    maxAttempts: 2,
    requiredDistinctResults: 2,
    maxAuthorizedCostUsdc: 0.015,
    attemptStore: store,
    authorizePayment: () => { authorizerCalls += 1; return true; },
    createEventId: stableIds(),
    attempt: async ({ attemptNumber, authorizePayment }) => {
      const approved = await authorizePayment(payment);
      if (!approved) throw new Error("cumulative cost cap refused authorization");
      return routed(attemptNumber, "42");
    },
  }), /cumulative cost cap/);
  assert.equal(authorizerCalls, 1);
  assert.equal(store.events.filter((event) => event.type === "PAYMENT_AUTHORIZED").length, 1);
  assert.equal(store.events.filter((event) => event.type === "DUPLICATE").length, 0);
});
