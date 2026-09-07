import { createPublicClient, formatEther, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_USDC_ADDRESS } from "../infrastructure/x402/payment-policy";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const rpcUrl = required("BASE_SEPOLIA_RPC_URL");
const deployer = privateKeyToAccount(required("PROOFPACT_DEPLOYER_PRIVATE_KEY") as `0x${string}`);
const authorizer = privateKeyToAccount(required("PROOFPACT_AUTHORIZER_PRIVATE_KEY") as `0x${string}`);
const owner = required("PROOFPACT_OWNER_ADDRESS");
if (!isAddress(owner) || owner === "0x0000000000000000000000000000000000000000") {
  throw new Error("PROOFPACT_OWNER_ADDRESS must be a non-zero EVM address");
}
const amountCap = BigInt(process.env.PROOFPACT_MAX_PACT_AMOUNT_BASE_UNITS?.trim() || "10000000000");
if (amountCap <= 0n || amountCap > 1_000_000_000_000n) {
  throw new Error("PROOFPACT_MAX_PACT_AMOUNT_BASE_UNITS must be between 1 and 1,000,000 USDC");
}

const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const [chainId, deployerBalance, usdcCode] = await Promise.all([
  client.getChainId(),
  client.getBalance({ address: deployer.address }),
  client.getCode({ address: BASE_SEPOLIA_USDC_ADDRESS }),
]);
if (chainId !== baseSepolia.id) throw new Error(`RPC returned chain ${chainId}, expected ${baseSepolia.id}`);
if (deployerBalance === 0n) throw new Error("Deployment account has no Base Sepolia ETH");
if (!usdcCode || usdcCode === "0x") throw new Error("Official Base Sepolia USDC has no contract code");

const configuredEscrow = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
if (configuredEscrow) {
  if (!isAddress(configuredEscrow)) throw new Error("PROOFPACT_ESCROW_ADDRESS is malformed");
  const code = await client.getCode({ address: configuredEscrow });
  if (code && code !== "0x") throw new Error("PROOFPACT_ESCROW_ADDRESS already points to deployed code");
}

console.log(JSON.stringify({
  status: "ESCROW_DEPLOYMENT_READY",
  chainId,
  deployer: deployer.address,
  deployerNativeEth: formatEther(deployerBalance),
  owner,
  authorizer: authorizer.address,
  rolesSeparated: deployer.address.toLowerCase() !== authorizer.address.toLowerCase(),
  token: BASE_SEPOLIA_USDC_ADDRESS,
  maxPactAmountBaseUnits: amountCap.toString(),
}, null, 2));
