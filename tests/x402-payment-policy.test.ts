import assert from "node:assert/strict";
import test from "node:test";
import { selectBaseSepoliaPayment, X402PolicyError } from "../infrastructure/x402/payment-policy";

function option(overrides: Record<string, unknown> = {}) {
  return {
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "10000",
    payTo: "0x1111111111111111111111111111111111111111",
    maxTimeoutSeconds: 60,
    ...overrides,
  };
}

function challenge(options: unknown[], overrides: Record<string, unknown> = {}): string {
  return Buffer.from(JSON.stringify({ x402Version: 2, accepts: options, ...overrides })).toString("base64");
}

test("selects the cheapest exact Base Sepolia USDC option", () => {
  const selected = selectBaseSepoliaPayment(challenge([
    option({ amount: "20000", payTo: "0x2222222222222222222222222222222222222222" }),
    option(),
  ]), 0.05);
  assert.equal(selected.amountUsdc, 0.01);
  assert.equal(selected.network, "eip155:84532");
});

test("refuses wrong networks, assets, schemes, and excessive prices", () => {
  assert.throws(
    () => selectBaseSepoliaPayment(challenge([
      option({ network: "eip155:1" }),
      option({ asset: "0x2222222222222222222222222222222222222222" }),
      option({ scheme: "upto" }),
    ]), 0.05),
    (error: unknown) => error instanceof X402PolicyError && error.code === "NO_COMPATIBLE_PAYMENT",
  );
  assert.throws(
    () => selectBaseSepoliaPayment(challenge([option({ amount: "10001" })]), 0.01),
    (error: unknown) => error instanceof X402PolicyError && error.code === "COST_EXCEEDED",
  );
});

test("requires a canonical x402 v2 challenge", () => {
  assert.throws(() => selectBaseSepoliaPayment("%%%", 0.01), /base64/);
  assert.throws(() => selectBaseSepoliaPayment(challenge([option()], { x402Version: 1 }), 0.01), /x402Version/);
});
