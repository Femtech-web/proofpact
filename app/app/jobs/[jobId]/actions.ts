"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createPublicClient, decodeEventLog, getAddress, hashMessage, http, isAddress, isHash, isHex, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { withPactStore } from "@/app/app/_lib/pact-data";
import { confirmPactFunding } from "@/infrastructure/settlement/confirm-funding";
import {
  buildRequesterVerificationMessage,
  normalizeRequesterVerificationAuthorization,
  type RequesterVerificationAuthorization,
} from "@/features/verification/domain/requester-verification-authorization";
import { executeSecureDeliveryVerification } from "@/infrastructure/telegraph/execute-secure-delivery-verification";
import { verificationInputFromSubmission } from "@/features/verification/application/submission-verification-input";
import { buildPactVerificationRequestSet } from "@/features/verification/application/secure-delivery-request-set";
import {
  buildPolicyWorkerSubmissionMessage,
  normalizePolicyWorkerSubmission,
  policySubmissionArtifactHash,
  type PolicyWorkerSubmissionFields,
} from "@/features/jobs/domain/policy-worker-submission";
import { buildRequestChangesMessage, normalizeRequestChanges, type RequestChangesAuthorization } from "@/features/jobs/domain/request-changes";
import { createBaseSettler } from "@/infrastructure/settlement/base-settler";
import { BASE_SEPOLIA_USDC_ADDRESS } from "@/infrastructure/x402/payment-policy";
import { appendSettlementEvent, confirmSettlementEvent } from "@/infrastructure/persistence/postgres-settlement-event-store";

export async function confirmFundingAction(
  pactId: string,
  transactionHash: string,
): Promise<Readonly<{ ok: true } | { ok: false; error: string }>> {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
  if (!rpcUrl || !escrowAddress || !isAddress(escrowAddress)) {
    return { ok: false, error: "Base escrow is not configured." };
  }
  if (!isHash(transactionHash)) return { ok: false, error: "The wallet returned an invalid transaction hash." };
  try {
    await withPactStore((store) => confirmPactFunding({
      store,
      externalPactId: pactId,
      transactionHash,
      rpcUrl,
      escrowAddress,
    }));
    revalidatePath(`/app/jobs/${pactId}`);
    revalidatePath("/app");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Funding confirmation failed." };
  }
}

export type SubmitEvidenceInput = PolicyWorkerSubmissionFields & Readonly<{ signature: string }>;

export type AuthorizeVerificationInput = RequesterVerificationAuthorization & Readonly<{ signature: string }>;
export type RequestChangesInput = RequestChangesAuthorization & Readonly<{ signature: string }>;

const PACT_SETTLED_EVENT = [{
  type: "event",
  name: "PactSettled",
  inputs: [
    { name: "pactId", type: "bytes32", indexed: true },
    { name: "receiptHash", type: "bytes32", indexed: true },
    { name: "action", type: "uint8", indexed: true },
    { name: "recipient", type: "address", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
    { name: "nonce", type: "uint256", indexed: false },
    { name: "authorizer", type: "address", indexed: false },
  ],
}] as const;

export async function prepareReleaseAction(pactId: string, receiptId: string): Promise<Readonly<{ ok: true; to: `0x${string}`; data: `0x${string}` } | { ok: false; error: string }>> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
  const authorizerPrivateKey = process.env.PROOFPACT_AUTHORIZER_PRIVATE_KEY?.trim();
  if (!databaseUrl || !escrowAddress || !isAddress(escrowAddress) || !authorizerPrivateKey || !/^0x[0-9a-fA-F]{64}$/.test(authorizerPrivateKey)) {
    return { ok: false, error: "Receipt-bound settlement is not configured." };
  }
  try {
    const { pact, receipt } = await withPactStore(async (store) => ({ pact: await store.getPact(pactId), receipt: await store.getReceipt(receiptId) }));
    if (!pact || !receipt || receipt.pactId !== pact.id) return { ok: false, error: "Approved pact or receipt was not found." };
    if (pact.status !== "APPROVED" || receipt.decision !== "RELEASE") return { ok: false, error: "Only an approved RELEASE receipt can move escrow." };
    if (!pact.onchainPactId || !pact.termsHash || !pact.escrowAddress) return { ok: false, error: "Pact has no confirmed onchain funding evidence." };
    const now = Math.floor(Date.now() / 1000);
    const nonce = BigInt(`0x${randomBytes(16).toString("hex")}`);
    const signed = await createBaseSettler({ escrowAddress: pact.escrowAddress, authorizerPrivateKey: authorizerPrivateKey as `0x${string}` }).authorize({
      pactId: pact.onchainPactId,
      receiptHash: receipt.receiptHash,
      termsHash: pact.termsHash,
      action: "RELEASE",
      recipient: pact.workerAddress,
      token: BASE_SEPOLIA_USDC_ADDRESS,
      amount: parseUnits(pact.rewardUsdc, 6),
      nonce,
      validAfter: now - 5,
      deadline: now + 15 * 60,
    });
    await appendSettlementEvent(databaseUrl, {
      pactId: pact.id, receiptId: receipt.id, eventType: "AUTHORIZED", escrowAddress: pact.escrowAddress,
      tokenAddress: BASE_SEPOLIA_USDC_ADDRESS, recipientAddress: pact.workerAddress,
      amountBaseUnits: signed.permit.amount.toString(), authorizerAddress: signed.authorizer,
      authorizerNonce: nonce.toString(),
    });
    return { ok: true, to: signed.transaction.to, data: signed.transaction.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not prepare settlement." };
  }
}

export async function confirmReleaseAction(pactId: string, receiptId: string, transactionHash: string): Promise<Readonly<{ ok: true } | { ok: false; error: string }>> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  const escrowAddress = process.env.PROOFPACT_ESCROW_ADDRESS?.trim();
  if (!databaseUrl || !rpcUrl || !escrowAddress || !isAddress(escrowAddress) || !isHash(transactionHash)) return { ok: false, error: "Settlement confirmation is not configured or the transaction hash is invalid." };
  try {
    const { pact, receipt } = await withPactStore(async (store) => ({ pact: await store.getPact(pactId), receipt: await store.getReceipt(receiptId) }));
    if (!pact || !receipt || receipt.pactId !== pact.id || !pact.onchainPactId) return { ok: false, error: "Pact settlement evidence was not found." };
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    const transactionReceipt = await client.waitForTransactionReceipt({ hash: transactionHash as `0x${string}`, confirmations: 1, timeout: 120_000 });
    if (transactionReceipt.status !== "success") return { ok: false, error: "Base rejected the release transaction." };
    const events = transactionReceipt.logs.flatMap((log) => {
      if (getAddress(log.address) !== getAddress(escrowAddress)) return [];
      try {
        const decoded = decodeEventLog({ abi: PACT_SETTLED_EVENT, data: log.data, topics: log.topics });
        return decoded.eventName === "PactSettled" ? [decoded.args] : [];
      } catch { return []; }
    });
    if (events.length !== 1) return { ok: false, error: "Expected exactly one ProofPact settlement event." };
    const event = events[0]!;
    if (event.pactId !== pact.onchainPactId || event.receiptHash !== receipt.receiptHash || event.action !== 0
      || getAddress(event.recipient) !== getAddress(pact.workerAddress) || event.amount !== parseUnits(pact.rewardUsdc, 6)) {
      return { ok: false, error: "Base settlement does not match the approved receipt and immutable pact terms." };
    }
    await confirmSettlementEvent(databaseUrl, {
      pactId: pact.id, receiptId: receipt.id, eventType: "CONFIRMED", escrowAddress: escrowAddress as `0x${string}`,
      tokenAddress: BASE_SEPOLIA_USDC_ADDRESS, recipientAddress: pact.workerAddress,
      amountBaseUnits: event.amount.toString(), authorizerAddress: event.authorizer,
      authorizerNonce: event.nonce.toString(), transactionHash: transactionHash as `0x${string}`,
    });
    revalidatePath(`/app/jobs/${pact.id}`);
    revalidatePath("/app/pacts");
    revalidatePath(`/app/receipts/${receipt.id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not confirm settlement." };
  }
}

export async function requestChangesAction(input: RequestChangesInput): Promise<Readonly<{ ok: true } | { ok: false; error: string }>> {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) return { ok: false, error: "Base Sepolia verification is not configured." };
  if (!isHex(input.signature)) return { ok: false, error: "The wallet returned an invalid signature." };
  try {
    const request = normalizeRequestChanges(input);
    const now = Math.floor(Date.now() / 1000);
    if (request.deadline < now || request.deadline > now + 15 * 60) return { ok: false, error: "The change request expired or has an unsafe validity window." };
    const pact = await withPactStore((store) => store.getPact(request.pactId));
    if (!pact) return { ok: false, error: "Pact not found." };
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    const valid = await client.verifyMessage({ address: pact.requesterAddress, message: buildRequestChangesMessage(request), signature: input.signature });
    if (!valid) return { ok: false, error: "Connect and sign with the requester wallet recorded on this pact." };
    await withPactStore((store) => store.createChangeRequest({
      pactId: request.pactId,
      submissionId: request.submissionId,
      requestedBy: pact.requesterAddress,
      feedback: request.feedback,
      idempotencyKey: `change-${request.nonce}`,
    }));
    revalidatePath(`/app/jobs/${pact.id}`);
    revalidatePath("/app/pacts");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not request changes." };
  }
}

export async function authorizeVerificationAction(
  input: AuthorizeVerificationInput,
): Promise<Readonly<{ ok: true; receiptId: string; decision: string; costUsdc: number } | { ok: false; error: string }>> {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) return { ok: false, error: "Base Sepolia verification is not configured." };
  if (!isHex(input.signature)) return { ok: false, error: "The wallet returned an invalid signature." };
  try {
    const normalized = normalizeRequesterVerificationAuthorization(input);
    const now = Math.floor(Date.now() / 1000);
    if (normalized.deadline < now || normalized.deadline > now + 15 * 60) {
      return { ok: false, error: "The verification authorization expired or has an unsafe validity window." };
    }
    const { pact, submission, receipt } = await withPactStore(async (store) => ({
      pact: await store.getPact(normalized.pactId),
      submission: await store.getLatestSubmission(normalized.pactId),
      receipt: await store.getLatestReceiptForPact(normalized.pactId),
    }));
    if (!pact || !submission) return { ok: false, error: "Submitted pact was not found." };
    const retryableHeld = pact.status === "HELD" && receipt?.decision === "RETRY";
    if (pact.status !== "SUBMITTED" && !retryableHeld) return { ok: false, error: "This pact is not awaiting verification." };
    if (submission.id !== normalized.submissionId || submission.artifactHash !== normalized.artifactHash) {
      return { ok: false, error: "The signed authorization does not match the latest worker evidence." };
    }
    const expectedIntents = buildPactVerificationRequestSet(verificationInputFromSubmission(pact, submission))
      .map((request) => request.intent);
    if (expectedIntents.join(",") !== normalized.intents.join(",")) {
      return { ok: false, error: "The signed authorization does not match the selected verification routes." };
    }
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    const valid = await client.verifyMessage({
      address: pact.requesterAddress,
      message: buildRequesterVerificationMessage(normalized),
      signature: input.signature,
    });
    if (!valid) return { ok: false, error: "Connect and sign with the requester wallet recorded on this pact." };

    await withPactStore((store) => store.beginVerification(pact.id, submission.id));
    const result = await executeSecureDeliveryVerification(pact.id, normalized.maxCostUsdc);
    revalidatePath(`/app/jobs/${pact.id}`);
    revalidatePath("/app");
    revalidatePath("/app/receipts");
    return { ok: true, receiptId: result.receiptId, decision: result.decision, costUsdc: result.settledCostUsdc };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Policy verification failed." };
  }
}

export async function submitWorkerEvidenceAction(
  input: SubmitEvidenceInput,
): Promise<Readonly<{ ok: true; submissionId: string } | { ok: false; error: string }>> {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) return { ok: false, error: "Base Sepolia verification is not configured." };
  if (!isHex(input.signature)) return { ok: false, error: "The wallet returned an invalid signature." };
  try {
    const normalized = normalizePolicyWorkerSubmission(input);
    const now = Math.floor(Date.now() / 1000);
    if (normalized.deadline < now || normalized.deadline > now + 15 * 60) {
      return { ok: false, error: "The submission signature expired or has an unsafe validity window." };
    }
    const { pact, previousSubmission } = await withPactStore(async (store) => ({
      pact: await store.getPact(normalized.pactId),
      previousSubmission: await store.getLatestSubmission(normalized.pactId),
    }));
    if (!pact) return { ok: false, error: "Pact not found." };
    if (pact.policyPackId !== normalized.policyPackId) return { ok: false, error: "The submitted evidence does not match this pact's policy pack." };
    if (pact.status !== "FUNDED" && pact.status !== "HELD") {
      return { ok: false, error: "Evidence can be submitted only after funding or during remediation." };
    }
    const message = buildPolicyWorkerSubmissionMessage(normalized);
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
    const valid = await client.verifyMessage({
      address: pact.workerAddress,
      message,
      signature: input.signature,
    });
    if (!valid) return { ok: false, error: "Connect and sign with the worker wallet recorded on this pact." };

    const artifactHash = policySubmissionArtifactHash(normalized);
    if (pact.status === "HELD" && previousSubmission?.artifactHash === artifactHash) {
      return { ok: false, error: "Remediation evidence is unchanged. Submit a new commit, deployment URL, or materially revised remediation claim before paying Miners again." };
    }
    const submission = await withPactStore((store) => store.createSubmission({
      pactId: pact.id,
      idempotencyKey: `submission-${normalized.nonce}`,
      submittedBy: pact.workerAddress,
      artifactHash,
      claimedRemediation: normalized.claimedOutcome,
      evidence: {
        ...normalized.evidence,
        attestation: {
          scheme: "EIP-191",
          signer: pact.workerAddress,
          message_hash: hashMessage(message),
          signature: input.signature,
          nonce: normalized.nonce,
          deadline: normalized.deadline,
        },
      },
    }));
    revalidatePath(`/app/jobs/${pact.id}`);
    revalidatePath("/app");
    return { ok: true, submissionId: submission.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Worker submission failed." };
  }
}
