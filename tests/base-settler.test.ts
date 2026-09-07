import assert from "node:assert/strict";
import test from "node:test";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA_CHAIN_ID,
  createBaseSettler,
  pactIdFromExternalId,
  type SettlementPermit,
} from "../infrastructure/settlement/base-settler";

const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const ESCROW = "0x1111111111111111111111111111111111111111" as const;
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as const;

const TYPES = {
  SettlementPermit: [
    { name: "pactId", type: "bytes32" },
    { name: "receiptHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "action", type: "uint8" },
    { name: "recipient", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "validAfter", type: "uint48" },
    { name: "deadline", type: "uint48" },
  ],
} as const;

function permit(overrides: Partial<SettlementPermit> = {}): SettlementPermit {
  return {
    pactId: pactIdFromExternalId("pact-123"),
    receiptHash: `0x${"44".repeat(32)}`,
    termsHash: `0x${"55".repeat(32)}`,
    action: "RELEASE",
    recipient: RECIPIENT,
    token: TOKEN,
    amount: 800_000_000n,
    nonce: 7n,
    validAfter: 1_800_000_000,
    deadline: 1_800_000_900,
    ...overrides,
  };
}

test("creates a Base Sepolia transaction carrying a valid receipt-bound EIP-712 signature", async () => {
  const input = permit();
  const signed = await createBaseSettler({ escrowAddress: ESCROW, authorizerPrivateKey: PRIVATE_KEY })
    .authorize(input);

  assert.equal(signed.authorizer.toLowerCase(), privateKeyToAccount(PRIVATE_KEY).address.toLowerCase());
  assert.equal(signed.transaction.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(signed.transaction.to, ESCROW);
  assert.equal(signed.transaction.value, 0n);

  const recovered = await recoverTypedDataAddress({
    domain: { name: "ProofPactEscrow", version: "1", chainId: BASE_SEPOLIA_CHAIN_ID, verifyingContract: ESCROW },
    types: TYPES,
    primaryType: "SettlementPermit",
    message: { ...input, action: 0 },
    signature: signed.signature,
  });
  assert.equal(recovered.toLowerCase(), signed.authorizer.toLowerCase());
  assert.ok(signed.transaction.data.startsWith("0x"));
});

test("maps external pact ids deterministically and rejects unsafe permits", async () => {
  assert.equal(pactIdFromExternalId("pact-123"), pactIdFromExternalId(" pact-123 "));
  assert.notEqual(pactIdFromExternalId("pact-123"), pactIdFromExternalId("pact-124"));
  const settler = createBaseSettler({ escrowAddress: ESCROW, authorizerPrivateKey: PRIVATE_KEY });
  await assert.rejects(() => settler.authorize(permit({ amount: 0n })), /amount and nonce/);
  await assert.rejects(() => settler.authorize(permit({ deadline: 1_800_000_000 })), /time bounds/);
});
