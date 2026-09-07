import assert from "node:assert/strict";
import test from "node:test";
import { runPaidSecureDelivery, type SecureDeliveryVerificationRecord } from "../features/verification/application/run-paid-secure-delivery";
import { createInMemoryVerificationAttemptStore } from "../features/verification/application/verification-attempt-store";
import type { TelegraphIntent } from "../infrastructure/telegraph/engine-client";
import { TelegraphEngineError } from "../infrastructure/telegraph/engine-client";

const input = {
  pactId: "pact-aggregate", requesterAddress: "0x1111111111111111111111111111111111111111",
  workerAddress: "0x2222222222222222222222222222222222222222", rewardUsdc: 1,
  repositoryUrl: "https://github.com/example/repo", commitSha: "abcdef1",
  deploymentUrl: "https://example.com/", claimedRemediation: "Submitted reviewed secure delivery evidence.",
} as const;

const intents = ["FRAUD_DETECTION", "CVE_LOOKUP", "URL_SCAN", "SSL_VERIFICATION"] as const;

function result(intent: TelegraphIntent, minerId: string): SecureDeliveryVerificationRecord {
  return {
    pactId: input.pactId, attemptNumber: 1, intent: intent as "FRAUD_DETECTION", queryHash: `0x${"1".repeat(64)}`,
    artifactHash: `0x${"2".repeat(64)}`, minerId, minerName: minerId, verdict: "PASS", confidence: 0.9,
    signalHash: `0x${"3".repeat(64)}`, rawResponseHash: `0x${"4".repeat(64)}`,
    responseEvidence: { status: "CAPTURED", byteLength: 18, value: { verdict: "PASS" } },
    costUsd: 0.01, durationMs: 20, observedAt: new Date().toISOString(), warnings: [],
  } as SecureDeliveryVerificationRecord;
}

test("accepts one Miner across different intents while enforcing uniqueness within an intent", async () => {
  const store = createInMemoryVerificationAttemptStore();
  const attempts = new Map<TelegraphIntent, number>();
  const miners = ["miner-a", "miner-a", "miner-c", "miner-d"];
  let index = 0;
  const run = await runPaidSecureDelivery({
    input, intents, maxAttemptsPerIntent: 3, maxAuthorizedCostUsdc: 0.12, attemptStore: store,
    authorizePayment: () => true,
    sleep: async () => undefined,
    attempt: async (intent, attemptNumber, authorize) => {
      attempts.set(intent, attemptNumber);
      assert.equal(await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 }), true);
      return result(intent, miners[index++]!);
    },
  });
  assert.equal(run.complete, true);
  assert.equal(run.records.length, 4);
  assert.equal(run.attempts, 4);
  assert.equal(run.authorizedCostUsdc, 0.04);
  assert.ok(!store.events.some((event) => event.type === "DUPLICATE"));
  assert.equal(attempts.get("CVE_LOOKUP"), 1);
});

test("records a repeated Miner identity without counting its refreshed result twice", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let calls = 0;
  const miners = ["miner-a", "miner-a", "miner-b", "miner-c", "miner-d", "miner-e"];
  const run = await runPaidSecureDelivery({
    input, intents, maxAttemptsPerIntent: 3, maxAuthorizedCostUsdc: 0.12, attemptStore: store,
    authorizePayment: () => true, sleep: async () => undefined,
    attempt: async (intent, _attemptNumber, authorize) => {
      assert.equal(await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 }), true);
      const record = result(intent, miners[calls++]!);
      return calls === 1 ? { ...record, verdict: "INCONCLUSIVE", confidence: 0.2 } : record;
    },
  });
  assert.equal(run.complete, true);
  assert.equal(run.attempts, 5);
  assert.equal(run.records.length, 4);
  assert.ok(store.events.some((event) => event.type === "DUPLICATE"));
});

test("uses a conclusive refresh from the same Miner without counting it twice", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let calls = 0;
  const run = await runPaidSecureDelivery({
    input,
    intents: ["FRAUD_DETECTION", "URL_SCAN", "SSL_VERIFICATION"],
    maxAttemptsPerIntent: 3,
    maxAuthorizedCostUsdc: 0.12,
    attemptStore: store,
    authorizePayment: () => true,
    sleep: async () => undefined,
    attempt: async (intent, _attemptNumber, authorize) => {
      calls += 1;
      assert.equal(await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 }), true);
      const minerId = intent === "SSL_VERIFICATION" ? "ssl-miner" : `miner-${calls}`;
      const record = result(intent, minerId);
      return intent === "SSL_VERIFICATION" && calls === 3
        ? { ...record, verdict: "INCONCLUSIVE" as const, confidence: 0 }
        : record;
    },
  });
  assert.equal(run.complete, true);
  assert.equal(run.records.length, 3);
  assert.equal(run.records.find((record) => record.intent === "SSL_VERIFICATION")?.verdict, "PASS");
  assert.ok(store.events.some((event) => event.type === "DUPLICATE"));
});

test("refuses payment authority beyond the aggregate ceiling", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let calls = 0;
  const run = await runPaidSecureDelivery({
    input, intents, maxAttemptsPerIntent: 1, maxAuthorizedCostUsdc: 0.02, attemptStore: store,
    authorizePayment: () => true,
    attempt: async (intent, _attempt, authorize) => {
      calls += 1;
      const approved = await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 });
      if (!approved) throw new Error("not authorized");
      return result(intent, `miner-${calls}`);
    },
  });
  assert.equal(run.complete, false);
  assert.equal(run.records.length, 2);
  assert.equal(run.authorizedCostUsdc, 0.02);
});

test("halts the workflow and returns partial evidence after an ambiguous payment is proven settled", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let calls = 0;
  const run = await runPaidSecureDelivery({
    input,
    intents,
    maxAttemptsPerIntent: 3,
    maxAuthorizedCostUsdc: 0.12,
    attemptStore: store,
    authorizePayment: () => true,
    reconcileAuthorizedFailure: async () => ({
      state: "SETTLED",
      evidence: { transactionHash: `0x${"a".repeat(64)}` },
    }),
    attempt: async (intent, attemptNumber, authorize) => {
      calls += 1;
      assert.equal(await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 }), true);
      if (calls === 2) throw new TelegraphEngineError("TRANSPORT_ERROR", "response lost");
      return result(intent, `miner-${attemptNumber}`);
    },
  });
  assert.equal(calls, 2);
  assert.equal(run.complete, false);
  assert.equal(run.haltedAfterAmbiguousPayment, true);
  assert.equal(run.authorizedCostUsdc, 0.02);
  assert.equal(run.settledCostUsdc, 0.02);
  assert.equal(run.records.length, 1);
});

test("tries another independent Miner after an inconclusive or low-confidence answer", async () => {
  const store = createInMemoryVerificationAttemptStore();
  let calls = 0;
  const run = await runPaidSecureDelivery({
    input,
    intents: ["FRAUD_DETECTION", "CVE_LOOKUP", "URL_SCAN"],
    maxAttemptsPerIntent: 3,
    maxAuthorizedCostUsdc: 0.12,
    attemptStore: store,
    authorizePayment: () => true,
    sleep: async () => undefined,
    attempt: async (intent, _attemptNumber, authorize) => {
      calls += 1;
      assert.equal(await authorize({ network: "eip155:84532", asset: "BASE_SEPOLIA_USDC", amountUsdc: 0.01, payTo: "0x3333333333333333333333333333333333333333", maxTimeoutSeconds: 60 }), true);
      const record = result(intent, `miner-${calls}`);
      return calls === 1 ? { ...record, verdict: "INCONCLUSIVE", confidence: 0.2 } : record;
    },
  });
  assert.equal(run.attempts, 4);
  assert.equal(run.records.length, 4);
  assert.equal(run.complete, true);
  assert.equal(run.authorizedCostUsdc, 0.04);
});
