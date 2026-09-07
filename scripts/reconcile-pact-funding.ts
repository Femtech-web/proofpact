import { isAddress, isHash } from "viem";
import { createPostgresPactStore } from "../infrastructure/persistence/postgres-pact-store";
import { confirmPactFunding } from "../infrastructure/settlement/confirm-funding";

const [externalPactId, transactionHash] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL?.trim();
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
if (!externalPactId) throw new Error("Usage: npm run reconcile:funding -- <pact-id> <transaction-hash>");
if (!transactionHash || !isHash(transactionHash)) throw new Error("A valid funding transaction hash is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required");
if (!escrowAddress || !isAddress(escrowAddress)) throw new Error("PROOFPACT_ESCROW_ADDRESS is required");

const store = createPostgresPactStore(databaseUrl);
try {
  const pact = await confirmPactFunding({
    store,
    externalPactId,
    transactionHash,
    rpcUrl,
    escrowAddress,
  });
  console.log(JSON.stringify({
    status: "PACT_FUNDING_RECONCILED",
    pactId: pact.id,
    lifecycleStatus: pact.status,
    fundingTransactionHash: pact.fundingTransactionHash,
    onchainPactId: pact.onchainPactId,
  }, null, 2));
} finally {
  await store.close();
}
