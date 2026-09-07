import { randomUUID } from "node:crypto";
import { getAddress, isAddress } from "viem";
import { buildFundingPlan } from "../features/funding/domain/funding-plan";
import type { Pact, PactStore, Receipt } from "../features/jobs/application/pact-store";
import { buildWorkerSubmissionMessage, normalizeWorkerSubmission } from "../features/jobs/domain/worker-submission";
import { getPolicyPack, POLICY_PACKS, type PolicyPackId } from "../features/policies/domain/policy-pack";
import {
  buildRequesterVerificationMessage,
  normalizeRequesterVerificationAuthorization,
} from "../features/verification/domain/requester-verification-authorization";
import { canonicalJson, sha256Hex, type JsonValue } from "../shared/json/canonical-json";

const MONEY = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;

export type McpApplicationOptions = Readonly<{
  store: PactStore;
  escrowAddress?: string;
  appBaseUrl?: string;
  now?: () => Date;
  getConfirmedSettlement?: (receiptId: string) => Promise<`0x${string}` | undefined>;
}>;

function publicUrl(base: string | undefined, path: string): string | undefined {
  if (!base?.trim()) return undefined;
  return new URL(path, `${base.replace(/\/$/, "")}/`).toString();
}

function requireAddress(value: string, field: string): `0x${string}` {
  if (!isAddress(value)) throw new TypeError(`${field} must be an EVM address`);
  return getAddress(value);
}

function receiptReplay(receipt: Receipt, confirmedSettlement?: `0x${string}`) {
  const computedHash = sha256Hex(canonicalJson(receipt.payload));
  return Object.freeze({
    receiptId: receipt.id,
    pactId: receipt.pactId,
    decision: receipt.decision,
    recordedHash: receipt.receiptHash,
    computedHash,
    hashMatches: computedHash === receipt.receiptHash,
    settlementTransactionHash: confirmedSettlement ?? receipt.settlementTransactionHash ?? null,
    sideEffects: Object.freeze({ routed: false, paid: false, signed: false, executed: false }),
  });
}

export function createProofPactMcpApplication(options: McpApplicationOptions) {
  const now = options.now ?? (() => new Date());

  async function pactBundle(pactId: string) {
    const pact = await options.store.getPact(pactId.trim());
    if (!pact) throw new Error("Pact not found");
    const [submission, receipt, changeRequest] = await Promise.all([
      options.store.getLatestSubmission(pact.id),
      options.store.getLatestReceiptForPact(pact.id),
      options.store.getLatestChangeRequest(pact.id),
    ]);
    return Object.freeze({
      pact,
      latestSubmission: submission ?? null,
      latestReceipt: receipt ?? null,
      latestChangeRequest: changeRequest ?? null,
      webUrl: publicUrl(options.appBaseUrl, `/app/jobs/${pact.id}`) ?? null,
    });
  }

  return Object.freeze({
    listPolicyPacks() {
      return POLICY_PACKS.map((pack) => Object.freeze({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        purpose: pack.purpose,
        requiredIntents: [...pack.requiredIntents],
        evidenceFields: pack.evidenceFields.map((field) => ({ ...field })),
        paidDesignPartnerProof: pack.id === "secure-delivery",
      }));
    },

    async createPactDraft(input: Readonly<{
      idempotencyKey: string;
      requesterAddress: string;
      workerAddress: string;
      policyPackId: PolicyPackId;
      title: string;
      acceptanceCriteria: string;
      rewardUsdc: string;
    }>) {
      const policy = getPolicyPack(input.policyPackId);
      const title = input.title.trim();
      const acceptanceCriteria = input.acceptanceCriteria.trim();
      if (title.length < 3 || title.length > 200) throw new TypeError("title must contain 3-200 characters");
      if (acceptanceCriteria.length < 20 || acceptanceCriteria.length > 5_000) {
        throw new TypeError("acceptanceCriteria must contain 20-5,000 characters");
      }
      if (!MONEY.test(input.rewardUsdc) || Number(input.rewardUsdc) <= 0 || Number(input.rewardUsdc) > 10_000) {
        throw new TypeError("rewardUsdc must be between 0 and 10,000 with at most six decimals");
      }
      const requesterAddress = requireAddress(input.requesterAddress, "requesterAddress");
      const workerAddress = requireAddress(input.workerAddress, "workerAddress");
      if (requesterAddress === workerAddress) throw new TypeError("requester and worker must be different addresses");
      const pact = await options.store.createPact({
        idempotencyKey: input.idempotencyKey,
        requesterAddress,
        workerAddress,
        policyPackId: policy.id,
        policyVersion: policy.version,
        title,
        acceptanceCriteria,
        rewardUsdc: input.rewardUsdc,
        chainId: 84_532,
      });
      return Object.freeze({ pact, webUrl: publicUrl(options.appBaseUrl, `/app/jobs/${pact.id}`) ?? null });
    },

    getPact: pactBundle,

    async prepareFunding(pactId: string, refundAfter?: number) {
      if (!options.escrowAddress) throw new Error("PROOFPACT_ESCROW_ADDRESS is not configured");
      const pact = await options.store.getPact(pactId.trim());
      if (!pact) throw new Error("Pact not found");
      if (pact.status !== "DRAFT") throw new Error("Only a draft pact can be prepared for funding");
      const nowSeconds = Math.floor(now().getTime() / 1_000);
      const deadline = refundAfter ?? nowSeconds + 30 * 24 * 60 * 60;
      const plan = buildFundingPlan({
        externalPactId: pact.id,
        requesterAddress: pact.requesterAddress,
        workerAddress: pact.workerAddress,
        policyPackId: pact.policyPackId,
        policyVersion: pact.policyVersion,
        title: pact.title,
        acceptanceCriteria: pact.acceptanceCriteria,
        rewardUsdc: pact.rewardUsdc,
        escrowAddress: requireAddress(options.escrowAddress, "escrowAddress"),
        refundAfter: deadline,
      }, nowSeconds);
      return Object.freeze({
        ...plan,
        requiresWallet: pact.requesterAddress,
        executesAutomatically: false,
        warning: "Submit approval first, wait for confirmation, then submit funding. ProofPact never receives the requester private key.",
      });
    },

    async prepareWorkerSubmission(input: Readonly<{
      pactId: string;
      repositoryUrl: string;
      commitSha: string;
      deploymentUrl: string;
      claimedRemediation: string;
      nonce?: string;
      deadline?: number;
    }>) {
      const pact = await options.store.getPact(input.pactId.trim());
      if (!pact) throw new Error("Pact not found");
      const nowSeconds = Math.floor(now().getTime() / 1_000);
      const submission = normalizeWorkerSubmission({
        ...input,
        nonce: input.nonce ?? randomUUID(),
        deadline: input.deadline ?? nowSeconds + 10 * 60,
      });
      return Object.freeze({
        submission,
        signer: pact.workerAddress,
        message: buildWorkerSubmissionMessage(submission),
        nextStep: "Sign this exact message with the recorded worker wallet, then submit it through ProofPact.",
        executesAutomatically: false,
      });
    },

    async estimateVerification(pactId: string) {
      const bundle = await pactBundle(pactId);
      const policy = getPolicyPack(bundle.pact.policyPackId);
      if (!bundle.latestSubmission) throw new Error("The worker has not submitted evidence");
      return Object.freeze({
        pactId: bundle.pact.id,
        submissionId: bundle.latestSubmission.id,
        artifactHash: bundle.latestSubmission.artifactHash,
        intents: [...policy.requiredIntents],
        expectedFirstPassCostUsdc: Number((policy.requiredIntents.length * 0.01).toFixed(2)),
        maximumAttemptsPerIntent: 3,
        maximumAuthorizedCostUsdc: 0.12,
        requiresExplicitRequesterSignature: true,
        startsPaidVerification: false,
      });
    },

    async prepareVerificationAuthorization(pactId: string, nonce?: string, deadline?: number) {
      const bundle = await pactBundle(pactId);
      const policy = getPolicyPack(bundle.pact.policyPackId);
      if (!bundle.latestSubmission) throw new Error("The worker has not submitted evidence");
      const nowSeconds = Math.floor(now().getTime() / 1_000);
      const authorization = normalizeRequesterVerificationAuthorization({
        pactId: bundle.pact.id,
        submissionId: bundle.latestSubmission.id,
        artifactHash: bundle.latestSubmission.artifactHash,
        intents: policy.requiredIntents,
        maxCostUsdc: 0.12,
        nonce: nonce ?? randomUUID(),
        deadline: deadline ?? nowSeconds + 10 * 60,
      });
      return Object.freeze({
        authorization,
        signer: bundle.pact.requesterAddress,
        message: buildRequesterVerificationMessage(authorization),
        startsPaidVerification: false,
        warning: "Signing authorizes only this submission and 0.12 USDC ceiling. It cannot release escrow.",
      });
    },

    async getReceipt(receiptId: string) {
      const receipt = await options.store.getReceipt(receiptId.trim());
      if (!receipt) throw new Error("Receipt not found");
      const confirmedSettlement = await options.getConfirmedSettlement?.(receipt.id);
      return Object.freeze({
        receipt,
        settlementTransactionHash: confirmedSettlement ?? receipt.settlementTransactionHash ?? null,
        replay: receiptReplay(receipt, confirmedSettlement),
        webUrl: publicUrl(options.appBaseUrl, `/app/receipts/${receipt.id}`) ?? null,
      });
    },

    async replayReceipt(receiptId: string) {
      const receipt = await options.store.getReceipt(receiptId.trim());
      if (!receipt) throw new Error("Receipt not found");
      return receiptReplay(receipt, await options.getConfirmedSettlement?.(receipt.id));
    },
  });
}

export type ProofPactMcpApplication = ReturnType<typeof createProofPactMcpApplication>;

export function asStructuredContent(value: unknown): Record<string, JsonValue> {
  return JSON.parse(canonicalJson(value)) as Record<string, JsonValue>;
}
