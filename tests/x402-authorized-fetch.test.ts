import assert from "node:assert/strict";
import test from "node:test";
import { createAuthorizedX402Fetch } from "../infrastructure/x402/authorized-fetch";

const PRIVATE_KEY = `0x${"1".repeat(64)}` as const;

function paymentRequired(amount = "10000") {
  const challenge = {
    x402Version: 2,
    resource: { url: "https://example.test/engine/v1/ask" },
    accepts: [{
      scheme: "exact",
      network: "eip155:84532",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      amount,
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    }],
  };
  return new Response(JSON.stringify(challenge), {
    status: 402,
    headers: { "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") },
  });
}

test("requires explicit authorization after validating the challenge", async () => {
  let requests = 0;
  const paidFetch = createAuthorizedX402Fetch({
    privateKey: PRIVATE_KEY,
    maxCostUsdc: 0.01,
    fetchImpl: async () => { requests += 1; return paymentRequired(); },
    authorizePayment: (payment) => {
      assert.equal(payment.amountUsdc, 0.01);
      assert.equal(payment.asset, "BASE_SEPOLIA_USDC");
      return false;
    },
  });
  await assert.rejects(() => paidFetch("https://example.test/engine/v1/ask"), /explicitly authorized/);
  assert.equal(requests, 1);
});

test("rejects an over-budget challenge before asking for authorization", async () => {
  let authorizations = 0;
  const paidFetch = createAuthorizedX402Fetch({
    privateKey: PRIVATE_KEY,
    maxCostUsdc: 0.01,
    fetchImpl: async () => paymentRequired("10001"),
    authorizePayment: () => { authorizations += 1; return true; },
  });
  await assert.rejects(() => paidFetch("https://example.test/engine/v1/ask"));
  assert.equal(authorizations, 0);
});
