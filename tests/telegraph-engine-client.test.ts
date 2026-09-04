import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { createFraudEngineClient, TelegraphEngineError } from "../infrastructure/telegraph/engine-client";

const signalHash = `0x${"a".repeat(64)}`;

function result(overrides: Record<string, unknown> = {}) {
  return {
    miner_id: "232",
    miner_name: "ranked-fraud-miner",
    endpoint: "/analyze",
    result: { verdict: "ALLOW", confidence: 0.92 },
    cost_usd: 0.01,
    duration_ms: 412,
    timestamp: "2026-09-04T12:00:00Z",
    intent: "FRAUD_DETECTION",
    signal_hash: signalHash,
    ...overrides,
  };
}

test("records routed identity, hashes, cost, and payment reference", async () => {
  let body = "";
  const responseBody = JSON.stringify(result());
  const paymentResponse = Buffer.from(JSON.stringify({
    success: true,
    transaction: "0xpayment",
    network: "eip155:84532",
  })).toString("base64");
  const client = createFraudEngineClient({
    nodeUrl: "https://devnode.telegraphprotocol.com",
    maxCostUsdc: 0.05,
    fetchImpl: async (_input, init) => {
      body = String(init?.body);
      return new Response(responseBody, { headers: { "payment-response": paymentResponse } });
    },
  });
  const response = await client.askFraud({ query: "Assess delivery fraud", context: { pact_id: "pact-1" } }, new AbortController().signal);
  assert.deepEqual(JSON.parse(body), { context: { pact_id: "pact-1" }, query: "Assess delivery fraud" });
  assert.equal(response.minerId, "232");
  assert.equal(response.costUsd, 0.01);
  assert.equal(response.paymentReceipt?.transaction, "0xpayment");
  assert.equal(response.rawResponseHash, `0x${createHash("sha256").update(responseBody).digest("hex")}`);
});

test("refuses wrong intents, excessive settled cost, and malformed signal hashes", async () => {
  for (const [overrides, message] of [
    [{ intent: "URL_SCAN" }, /unexpected Intent/],
    [{ cost_usd: 0.06 }, /configured maximum/],
    [{ signal_hash: "0x1234" }, /signal_hash/],
  ] as const) {
    const client = createFraudEngineClient({
      nodeUrl: "https://devnode.telegraphprotocol.com",
      maxCostUsdc: 0.05,
      fetchImpl: async () => new Response(JSON.stringify(result(overrides))),
    });
    await assert.rejects(() => client.askFraud({ query: "Assess", context: {} }, new AbortController().signal), message);
  }
});

test("returns a bounded payment challenge without exposing response content", async () => {
  const challenge = Buffer.from(JSON.stringify({ x402Version: 2 })).toString("base64");
  const client = createFraudEngineClient({
    nodeUrl: "https://devnode.telegraphprotocol.com",
    maxCostUsdc: 0.05,
    fetchImpl: async () => new Response("sensitive", { status: 402, headers: { "payment-required": challenge } }),
  });
  await assert.rejects(
    () => client.askFraud({ query: "Assess", context: {} }, new AbortController().signal),
    (error: unknown) => error instanceof TelegraphEngineError
      && error.code === "PAYMENT_REQUIRED"
      && error.paymentRequired === challenge
      && !error.message.includes("sensitive"),
  );
});

test("captures bounded payment failure metadata without persisting its body", async () => {
  const paymentResponse = Buffer.from(JSON.stringify({
    success: false,
    errorReason: "invalid_exact_evm_transaction_failed",
    network: "eip155:84532",
  })).toString("base64");
  const client = createFraudEngineClient({
    nodeUrl: "https://devnode.telegraphprotocol.com",
    maxCostUsdc: 0.05,
    fetchImpl: async () => new Response(JSON.stringify({ error_code: "UPSTREAM_PAYMENT_FAILED", secret: "never persist me" }), {
      status: 402,
      headers: { "payment-response": paymentResponse },
    }),
  });
  await assert.rejects(
    () => client.askFraud({ query: "Assess", context: {} }, new AbortController().signal),
    (error: unknown) => error instanceof TelegraphEngineError
      && error.code === "INVALID_RESPONSE"
      && error.paymentFailure?.paymentSuccess === false
      && error.paymentFailure.paymentError === "invalid_exact_evm_transaction_failed"
      && error.paymentFailure.serverError === "UPSTREAM_PAYMENT_FAILED"
      && !JSON.stringify(error.paymentFailure).includes("never persist me"),
  );
});
