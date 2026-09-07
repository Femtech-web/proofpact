import { createPublicClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_USDC_ADDRESS } from "../infrastructure/x402/payment-policy";

const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const ownerAddress = process.env.PROOFPACT_OWNER_ADDRESS?.trim();
const authorizerKey = process.env.PROOFPACT_AUTHORIZER_PRIVATE_KEY?.trim();
const amountCap = BigInt(process.env.PROOFPACT_MAX_PACT_AMOUNT_BASE_UNITS?.trim() || "10000000000");

if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");
if (!escrowAddress || !isAddress(escrowAddress)) {
  throw new Error("PROOFPACT_ESCROW_ADDRESS must be a valid EVM address");
}
if (!ownerAddress || !isAddress(ownerAddress)) {
  throw new Error("PROOFPACT_OWNER_ADDRESS must be a valid EVM address");
}
if (!authorizerKey) throw new Error("PROOFPACT_AUTHORIZER_PRIVATE_KEY is required");

const expectedAuthorizer = privateKeyToAccount(authorizerKey as `0x${string}`).address;
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const abi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "authorizer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "TOKEN",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "MAX_PACT_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const address = getAddress(escrowAddress);
const [chainId, code, owner, authorizer, token, maxPactAmount] = await Promise.all([
  client.getChainId(),
  client.getCode({ address }),
  client.readContract({ address, abi, functionName: "owner" }),
  client.readContract({ address, abi, functionName: "authorizer" }),
  client.readContract({ address, abi, functionName: "TOKEN" }),
  client.readContract({ address, abi, functionName: "MAX_PACT_AMOUNT" }),
]);

if (chainId !== baseSepolia.id) throw new Error(`RPC returned chain ${chainId}, expected ${baseSepolia.id}`);
if (!code || code === "0x") throw new Error("No deployed bytecode exists at PROOFPACT_ESCROW_ADDRESS");
if (getAddress(owner) !== getAddress(ownerAddress)) throw new Error("Onchain owner does not match configuration");
if (getAddress(authorizer) !== getAddress(expectedAuthorizer)) {
  throw new Error("Onchain authorizer does not match the configured authorizer key");
}
if (getAddress(token) !== getAddress(BASE_SEPOLIA_USDC_ADDRESS)) {
  throw new Error("Onchain token is not official Base Sepolia USDC");
}
if (maxPactAmount !== amountCap) throw new Error("Onchain pact amount cap does not match configuration");

console.log(JSON.stringify({
  status: "ESCROW_DEPLOYMENT_VERIFIED",
  chainId,
  contractAddress: address,
  bytecodeBytes: (code.length - 2) / 2,
  owner: getAddress(owner),
  authorizer: getAddress(authorizer),
  token: getAddress(token),
  maxPactAmountBaseUnits: maxPactAmount.toString(),
}, null, 2));
