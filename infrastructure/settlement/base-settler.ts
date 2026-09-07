import "server-only";

import { encodeFunctionData, isAddress, isHash, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;

export type SettlementAction = "RELEASE" | "REFUND";

export type SettlementPermit = Readonly<{
  pactId: `0x${string}`;
  receiptHash: `0x${string}`;
  termsHash: `0x${string}`;
  action: SettlementAction;
  recipient: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  validAfter: number;
  deadline: number;
}>;

export type SignedSettlement = Readonly<{
  permit: SettlementPermit;
  authorizer: `0x${string}`;
  signature: `0x${string}`;
  transaction: Readonly<{
    chainId: typeof BASE_SEPOLIA_CHAIN_ID;
    to: `0x${string}`;
    data: `0x${string}`;
    value: 0n;
  }>;
}>;

export interface BaseSettler {
  authorize(permit: SettlementPermit): Promise<SignedSettlement>;
}

export type BaseSettlerConfig = Readonly<{
  escrowAddress: `0x${string}`;
  authorizerPrivateKey: `0x${string}`;
}>;

const ESCROW_ABI = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        components: [
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
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const SETTLEMENT_TYPES = {
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

const ZERO_HASH = `0x${"0".repeat(64)}`;

function assertPermit(permit: SettlementPermit): void {
  if (!isHash(permit.pactId) || !isHash(permit.receiptHash) || !isHash(permit.termsHash)
    || permit.pactId === ZERO_HASH || permit.receiptHash === ZERO_HASH || permit.termsHash === ZERO_HASH) {
    throw new TypeError("pactId, receiptHash, and termsHash must be non-zero bytes32 values");
  }
  if (!isAddress(permit.recipient) || !isAddress(permit.token)) {
    throw new TypeError("recipient and token must be EVM addresses");
  }
  if (permit.amount <= 0n || permit.nonce < 0n) throw new TypeError("amount and nonce are invalid");
  if (!Number.isSafeInteger(permit.validAfter) || !Number.isSafeInteger(permit.deadline)
    || permit.validAfter < 0 || permit.deadline <= permit.validAfter || permit.deadline > 2 ** 48 - 1) {
    throw new TypeError("settlement time bounds are invalid");
  }
}

function actionCode(action: SettlementAction): 0 | 1 {
  return action === "RELEASE" ? 0 : 1;
}

export function pactIdFromExternalId(externalId: string): `0x${string}` {
  const value = externalId.trim();
  if (!value || value.length > 200) throw new TypeError("external pact id must be 1-200 characters");
  return keccak256(stringToHex(value));
}

export function createBaseSettler(config: BaseSettlerConfig): BaseSettler {
  if (!isAddress(config.escrowAddress)) throw new TypeError("escrowAddress must be an EVM address");
  const account = privateKeyToAccount(config.authorizerPrivateKey);

  return Object.freeze({
    async authorize(permit: SettlementPermit): Promise<SignedSettlement> {
      assertPermit(permit);
      const action = actionCode(permit.action);
      const message = { ...permit, action };
      const signature = await account.signTypedData({
        domain: {
          name: "ProofPactEscrow",
          version: "1",
          chainId: BASE_SEPOLIA_CHAIN_ID,
          verifyingContract: config.escrowAddress,
        },
        types: SETTLEMENT_TYPES,
        primaryType: "SettlementPermit",
        message,
      });
      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "settle",
        args: [message, signature],
      });
      return Object.freeze({
        permit,
        authorizer: account.address,
        signature,
        transaction: Object.freeze({
          chainId: BASE_SEPOLIA_CHAIN_ID,
          to: config.escrowAddress,
          data,
          value: 0n,
        }),
      });
    },
  });
}
