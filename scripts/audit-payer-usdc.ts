import { createPublicClient, formatUnits, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA_USDC_ADDRESS } from "../infrastructure/x402/payment-policy";

const privateKey = process.env.TELEGRAPH_PAYER_PRIVATE_KEY?.trim();
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("TELEGRAPH_PAYER_PRIVATE_KEY is invalid");
if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");

const payer = privateKeyToAccount(privateKey as `0x${string}`).address;
const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const latestBlock = await client.getBlockNumber();
const fromBlock = latestBlock > 5_000n ? latestBlock - 5_000n : 0n;
const [balance, logs] = await Promise.all([
  client.readContract({
    address: BASE_SEPOLIA_USDC_ADDRESS,
    abi: [parseAbiItem("function balanceOf(address account) view returns (uint256)")],
    functionName: "balanceOf",
    args: [payer],
  }),
  client.getLogs({
    address: BASE_SEPOLIA_USDC_ADDRESS,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
    args: { from: payer },
    fromBlock,
    toBlock: latestBlock,
  }),
]);

const transfers = await Promise.all(logs.map(async (log) => {
  const block = await client.getBlock({ blockNumber: log.blockNumber });
  return {
    transactionHash: log.transactionHash,
    blockNumber: Number(log.blockNumber),
    timestamp: new Date(Number(block.timestamp) * 1_000).toISOString(),
    to: log.args.to,
    amountUsdc: formatUnits(log.args.value ?? 0n, 6),
  };
}));

console.log(JSON.stringify({
  payer,
  chainId: baseSepolia.id,
  exactBalanceMicroUsdc: balance.toString(),
  balanceUsdc: formatUnits(balance, 6),
  scannedBlocks: { from: Number(fromBlock), to: Number(latestBlock) },
  outgoingTransfers: transfers,
}, null, 2));
