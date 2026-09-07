import "server-only";

import { createPublicClient, decodeEventLog, getAddress, http, isHash } from "viem";
import { baseSepolia } from "viem/chains";
import type { PactStore } from "@/features/jobs/application/pact-store";
import { buildFundingPlan } from "@/features/funding/domain/funding-plan";

const PACT_FUNDED_EVENT = [{
  type: "event",
  name: "PactFunded",
  inputs: [
    { name: "pactId", type: "bytes32", indexed: true },
    { name: "requester", type: "address", indexed: true },
    { name: "worker", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "refundAfter", type: "uint48", indexed: false },
    { name: "termsHash", type: "bytes32", indexed: false },
  ],
}] as const;

export async function confirmPactFunding(input: Readonly<{
  store: PactStore;
  externalPactId: string;
  transactionHash: `0x${string}`;
  rpcUrl: string;
  escrowAddress: `0x${string}`;
}>) {
  if (!isHash(input.transactionHash)) throw new TypeError("transactionHash must be a 32-byte hash");
  const pact = await input.store.getPact(input.externalPactId);
  if (!pact) throw new Error("Pact not found");
  const client = createPublicClient({ chain: baseSepolia, transport: http(input.rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash: input.transactionHash });
  if (receipt.status !== "success") throw new Error("Funding transaction did not succeed");

  const matchingLogs = receipt.logs.flatMap((log) => {
    if (getAddress(log.address) !== getAddress(input.escrowAddress)) return [];
    try {
      const decoded = decodeEventLog({ abi: PACT_FUNDED_EVENT, data: log.data, topics: log.topics });
      return decoded.eventName === "PactFunded" ? [decoded.args] : [];
    } catch {
      return [];
    }
  });
  if (matchingLogs.length !== 1) throw new Error("Expected exactly one ProofPact PactFunded event");
  const event = matchingLogs[0]!;
  // Smart accounts may be invoked by an outer relayer, so receipt.from is not
  // necessarily the requester. The escrow event records the actual contract
  // caller and is checked against every immutable pact field below.
  const refundAfter = Number(event.refundAfter);
  const plan = buildFundingPlan({
    externalPactId: pact.id,
    requesterAddress: pact.requesterAddress,
    workerAddress: pact.workerAddress,
    policyPackId: pact.policyPackId,
    policyVersion: pact.policyVersion,
    title: pact.title,
    acceptanceCriteria: pact.acceptanceCriteria,
    rewardUsdc: pact.rewardUsdc,
    escrowAddress: input.escrowAddress,
    refundAfter,
  }, Math.floor(new Date(pact.createdAt).getTime() / 1000));

  if (event.pactId !== plan.pactId
    || getAddress(event.requester) !== getAddress(pact.requesterAddress)
    || getAddress(event.worker) !== getAddress(pact.workerAddress)
    || event.amount.toString() !== plan.amountBaseUnits
    || event.termsHash !== plan.termsHash) {
    throw new Error("Onchain funding event does not match the immutable pact terms");
  }

  return input.store.confirmFunding({
    pactId: pact.id,
    escrowAddress: input.escrowAddress,
    fundingTransactionHash: input.transactionHash,
    onchainPactId: plan.pactId,
    termsHash: plan.termsHash,
    refundAfter: new Date(refundAfter * 1000).toISOString(),
  });
}
