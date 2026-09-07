import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");

const result = spawnSync("forge", [
  "script",
  "--root",
  "contracts",
  "contracts/script/DeployProofPactEscrow.s.sol:DeployProofPactEscrow",
  "--offline",
  "--rpc-url",
  rpcUrl,
  "--broadcast",
], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Forge deployment exited with status ${String(result.status)}`);

const broadcastUrl = new URL(
  "../contracts/broadcast/DeployProofPactEscrow.s.sol/84532/run-latest.json",
  import.meta.url,
);
const broadcast = JSON.parse(await readFile(broadcastUrl, "utf8")) as {
  transactions?: readonly { contractName?: string; contractAddress?: string; hash?: string }[];
};
const deployment = broadcast.transactions?.find((transaction) =>
  transaction.contractName === "ProofPactEscrow" && transaction.contractAddress
);
if (!deployment?.contractAddress || !deployment.hash) {
  throw new Error("Deployment broadcast completed but its contract address could not be resolved");
}
console.log(JSON.stringify({
  status: "ESCROW_DEPLOYED",
  chainId: 84532,
  contractAddress: deployment.contractAddress,
  transactionHash: deployment.hash,
  next: "Set PROOFPACT_ESCROW_ADDRESS to contractAddress and run the deployment verifier.",
}, null, 2));
