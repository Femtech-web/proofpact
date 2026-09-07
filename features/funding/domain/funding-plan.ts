import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
} from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const MAX_PACT_AMOUNT_BASE_UNITS = 10_000_000_000n;

export type FundingPlanInput = Readonly<{
  externalPactId: string;
  requesterAddress: `0x${string}`;
  workerAddress: `0x${string}`;
  policyPackId: string;
  policyVersion: string;
  title: string;
  acceptanceCriteria: string;
  rewardUsdc: string;
  escrowAddress: `0x${string}`;
  refundAfter: number;
}>;

export type WalletTransaction = Readonly<{
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  to: `0x${string}`;
  data: `0x${string}`;
  value: "0x0";
}>;

export type FundingPlan = Readonly<{
  pactId: `0x${string}`;
  termsHash: `0x${string}`;
  amountBaseUnits: string;
  refundAfter: number;
  approval: WalletTransaction;
  funding: WalletTransaction;
}>;

const USDC_ABI = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

const ESCROW_ABI = [{
  type: "function",
  name: "fundPact",
  stateMutability: "nonpayable",
  inputs: [
    { name: "pactId", type: "bytes32" },
    { name: "worker", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "refundAfter", type: "uint48" },
    { name: "termsHash", type: "bytes32" },
  ],
  outputs: [],
}] as const;

function textHash(value: string, field: string): `0x${string}` {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return keccak256(stringToHex(normalized));
}

export function onchainPactId(externalPactId: string): `0x${string}` {
  return textHash(externalPactId, "externalPactId");
}

export function buildFundingPlan(input: FundingPlanInput, nowSeconds: number): FundingPlan {
  if (!isAddress(input.requesterAddress) || !isAddress(input.workerAddress) || !isAddress(input.escrowAddress)) {
    throw new TypeError("requester, worker, and escrow must be EVM addresses");
  }
  if (getAddress(input.requesterAddress) === getAddress(input.workerAddress)) {
    throw new TypeError("requester and worker must be different addresses");
  }
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(input.refundAfter)
    || input.refundAfter <= nowSeconds || input.refundAfter > 2 ** 48 - 1) {
    throw new TypeError("refundAfter must be a future uint48 timestamp");
  }
  const amount = parseUnits(input.rewardUsdc, 6);
  if (amount <= 0n || amount > MAX_PACT_AMOUNT_BASE_UNITS) {
    throw new TypeError("reward must be between 0 and 10,000 USDC");
  }

  const pactId = onchainPactId(input.externalPactId);
  const termsHash = keccak256(encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "address" },
      { type: "address" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint48" },
    ],
    [
      pactId,
      getAddress(input.requesterAddress),
      getAddress(input.workerAddress),
      textHash(input.policyPackId, "policyPackId"),
      textHash(input.policyVersion, "policyVersion"),
      textHash(input.title, "title"),
      textHash(input.acceptanceCriteria, "acceptanceCriteria"),
      amount,
      BigInt(BASE_SEPOLIA_CHAIN_ID),
      getAddress(input.escrowAddress),
      input.refundAfter,
    ],
  ));
  const base = { chainId: BASE_SEPOLIA_CHAIN_ID, value: "0x0" } as const;

  return Object.freeze({
    pactId,
    termsHash,
    amountBaseUnits: amount.toString(),
    refundAfter: input.refundAfter,
    approval: Object.freeze({
      ...base,
      to: BASE_SEPOLIA_USDC,
      data: encodeFunctionData({ abi: USDC_ABI, functionName: "approve", args: [input.escrowAddress, amount] }),
    }),
    funding: Object.freeze({
      ...base,
      to: input.escrowAddress,
      data: encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "fundPact",
        args: [pactId, input.workerAddress, amount, input.refundAfter, termsHash],
      }),
    }),
  });
}
