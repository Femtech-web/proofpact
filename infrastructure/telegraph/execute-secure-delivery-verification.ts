import "server-only";

import { createPublicClient, formatUnits, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { withPactStore } from "@/app/app/_lib/pact-data";
import { buildFraudQuestion, toFraudVerificationRecord } from "@/features/verification/application/fraud-verification";
import { buildSecureDeliveryIntentQuestion, toStrictVerificationRecord } from "@/features/verification/application/secure-delivery-intents";
import { toGenericPolicyVerificationRecord } from "@/features/verification/application/policy-verification";
import { runPaidSecureDelivery } from "@/features/verification/application/run-paid-secure-delivery";
import { buildPactVerificationRequestSet } from "@/features/verification/application/secure-delivery-request-set";
import { verificationInputFromSubmission } from "@/features/verification/application/submission-verification-input";
import { evaluateSettlement } from "@/features/settlement/domain/evaluate-settlement";
import { canonicalJson, sha256Hex, type JsonValue } from "@/shared/json/canonical-json";
import { createManagedDnsFetch } from "@/infrastructure/http/managed-dns-fetch";
import { createPostgresVerificationAttemptStore } from "@/infrastructure/persistence/postgres-verification-attempt-store";
import { createTelegraphEngineClient, type TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import { fetchMinerSignalMap } from "@/infrastructure/telegraph/miner-signal-map";
import { normalizeRoutedResultWithProse } from "@/features/verification/application/routed-result-normalizer";
import { createAuthorizedX402Fetch } from "@/infrastructure/x402/authorized-fetch";
import { BASE_SEPOLIA_USDC_ADDRESS } from "@/infrastructure/x402/payment-policy";
import { createExpiredAuthorizationReconciler } from "@/infrastructure/x402/reconcile-authorized-payment";
import { verifyGithubCommit } from "@/infrastructure/source/github-commit-verifier";

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export type SecureDeliveryExecutionSummary = Readonly<{
  pactId: string;
  submissionId: string;
  runId: string;
  receiptId: string;
  receiptHash: `0x${string}`;
  decision: string;
  reason: string;
  attempts: number;
  authorizedCostUsdc: number;
  settledCostUsdc: number;
}>;

export async function executeSecureDeliveryVerification(
  pactId: string,
  authorizedCeiling = 0.12,
): Promise<SecureDeliveryExecutionSummary> {
  if (authorizedCeiling !== 0.12) throw new Error("Secure Delivery uses a fixed 0.12 USDC authorization ceiling");
  const databaseUrl = required("DATABASE_URL");
  const nodeUrl = required("TELEGRAPH_ENGINE_URL");
  const rpcUrl = required("BASE_SEPOLIA_RPC_URL");
  const privateKey = required("TELEGRAPH_PAYER_PRIVATE_KEY");
  if (!PRIVATE_KEY.test(privateKey)) throw new Error("TELEGRAPH_PAYER_PRIVATE_KEY must be a 32-byte private key");
  const maxCostUsdc = Number(required("TELEGRAPH_MAX_PRICE_USDC"));
  if (!Number.isFinite(maxCostUsdc) || maxCostUsdc <= 0 || maxCostUsdc > 1) throw new Error("TELEGRAPH_MAX_PRICE_USDC must be greater than 0 and at most 1");
  const maxAttempts = Number(required("TELEGRAPH_MAX_ATTEMPTS_PER_INTENT"));
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error("TELEGRAPH_MAX_ATTEMPTS_PER_INTENT must be 1-3");

  const { pact, submission } = await withPactStore(async (store) => ({
    pact: await store.getPact(pactId),
    submission: await store.getLatestSubmission(pactId),
  }));
  if (!pact || !submission) throw new Error("Submitted pact was not found");
  if (pact.status !== "VERIFYING" && pact.status !== "SUBMITTED") throw new Error("Pact is not ready for verification");
  const input = verificationInputFromSubmission({ ...pact, status: "SUBMITTED" }, submission);
  const requests = buildPactVerificationRequestSet(input);
  const intents = requests.map((request) => request.intent);
  const payer = privateKeyToAccount(privateKey as `0x${string}`).address;
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const initialBalance = await publicClient.readContract({
    address: BASE_SEPOLIA_USDC_ADDRESS,
    abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")],
    functionName: "balanceOf",
    args: [payer],
  });
  const requiredBalance = BigInt(Math.ceil(authorizedCeiling * 1_000_000));
  if (initialBalance < requiredBalance) {
    throw new Error(`Payer has ${formatUnits(initialBalance, 6)} USDC; ${authorizedCeiling.toFixed(2)} USDC is required for the authorized ceiling`);
  }

  const managedFetch = createManagedDnsFetch(process.env.TELEGRAPH_DNS_SERVERS?.trim() || "8.8.8.8");
  const attemptStore = createPostgresVerificationAttemptStore(databaseUrl);
  const runSignal = AbortSignal.timeout(12 * 60_000);
  try {
    const sourceProof = "policyPackId" in input
      ? undefined
      : await verifyGithubCommit(input, runSignal, managedFetch.fetch);
    const mappings = new Map(await Promise.all(intents.map(async (intent) =>
      [intent, await fetchMinerSignalMap(nodeUrl, intent, runSignal, managedFetch.fetch)] as const)));
    const result = await runPaidSecureDelivery({
      input,
      intents,
      maxAttemptsPerIntent: maxAttempts,
      maxAuthorizedCostUsdc: authorizedCeiling,
      attemptStore,
      reconcileAuthorizedFailure: createExpiredAuthorizationReconciler({ rpcUrl, payer, signal: runSignal }),
      authorizePayment: async (payment, context) => {
        if (context.cumulativeAuthorizedCostUsdc > authorizedCeiling) return false;
        const balance = await publicClient.readContract({
          address: BASE_SEPOLIA_USDC_ADDRESS,
          abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")],
          functionName: "balanceOf",
          args: [payer],
        });
        return balance >= BigInt(Math.ceil(payment.amountUsdc * 1_000_000));
      },
      attempt: async (intent: TelegraphIntent, attemptNumber, authorizePayment) => {
        const paidFetch = createAuthorizedX402Fetch({
          privateKey: privateKey as `0x${string}`,
          maxCostUsdc,
          baseSepoliaRpcUrl: rpcUrl,
          authorizePayment,
          fetchImpl: managedFetch.fetch,
        });
        const engine = createTelegraphEngineClient({ nodeUrl, maxCostUsdc, fetchImpl: paidFetch });
        const genericRequest = requests.find((candidate) => candidate.intent === intent);
        if (!genericRequest) throw new TypeError(`No ${intent} request exists for this policy pack`);
        if ("policyPackId" in input) {
          const routed = await engine.ask({ query: genericRequest.query, context: genericRequest.context }, intent, runSignal);
          const mapping = mappings.get(intent)?.get(routed.minerId);
          const normalized = await normalizeRoutedResultWithProse(intent, routed.result, mapping, runSignal);
          return toGenericPolicyVerificationRecord(input, genericRequest, routed, attemptNumber, mapping, normalized);
        }
        if (intent === "FRAUD_DETECTION") {
          const request = buildFraudQuestion(input);
          const routed = await engine.ask(request, intent, runSignal);
          const mapping = mappings.get(intent)?.get(routed.minerId);
          const normalized = await normalizeRoutedResultWithProse(intent, routed.result, mapping, runSignal);
          return toFraudVerificationRecord(input, request, routed, attemptNumber, mapping, normalized);
        }
        const request = buildSecureDeliveryIntentQuestion(intent, input);
        const routed = await engine.ask(request, intent, runSignal);
        const mapping = mappings.get(intent)?.get(routed.minerId);
        const normalized = intent === "CONTENT_EXTRACTION"
          ? undefined
          : await normalizeRoutedResultWithProse(intent, routed.result, mapping, runSignal);
        return toStrictVerificationRecord(intent, input, request, routed, attemptNumber, mapping, normalized);
      },
    });

    const decision = evaluateSettlement(result.signals, pact.policyPackId, intents);
    const decidedAt = new Date().toISOString();
    const payload = {
      version: 1,
      kind: "PROOFPACT_SECURE_DELIVERY_RECEIPT",
      pact_id: pact.id,
      submission_id: submission.id,
      artifact_hash: submission.artifactHash,
      policy_pack: pact.policyPackId,
      policy_version: pact.policyVersion,
      required_intents: intents,
      ...(sourceProof ? { source_provenance: {
        provider: sourceProof.provider,
        repository: sourceProof.repository,
        commit_sha: sourceProof.commitSha,
        permalink: sourceProof.permalink,
        observed_at: sourceProof.observedAt,
        response_hash: sourceProof.responseHash,
        claim_terms_matched: [...sourceProof.claimTermsMatched],
      } } : {}),
      decision: decision.decision,
      reason: decision.reason,
      missing_intents: [...decision.missingIntents],
      authorized_cost_usdc: result.authorizedCostUsdc,
      settled_cost_usdc: result.settledCostUsdc,
      records: result.records.map((record) => ({
        intent: record.intent,
        miner_id: record.minerId,
        miner_name: record.minerName,
        verdict: record.verdict,
        confidence: record.confidence,
        signal_hash: record.signalHash,
        raw_response_hash: record.rawResponseHash,
        response_evidence: record.responseEvidence,
        query_hash: record.queryHash,
        cost_usd: record.costUsd,
        observed_at: record.observedAt,
        ...(record.paymentReference ? { payment_reference: record.paymentReference } : {}),
        normalization: record.warnings.find((warning) => warning.startsWith("NORMALIZATION_")) ?? "NORMALIZATION_UNKNOWN",
      })),
      decided_at: decidedAt,
    } satisfies JsonValue;
    const receiptHash = sha256Hex(canonicalJson(payload));
    const receipt = await withPactStore((store) => store.completeVerification({
      pactId: pact.id,
      submissionId: submission.id,
      runId: result.runId,
      idempotencyKey: `secure-delivery-${submission.id}-${result.runId}`,
      signals: result.signals,
      decision: {
        decision: decision.decision,
        reason: decision.reason,
        missingIntents: decision.missingIntents,
        policyVersion: pact.policyVersion,
        decidedAt,
      },
      receipt: { receiptHash, artifactHash: submission.artifactHash, decision: decision.decision, payload },
    }));
    return Object.freeze({
      pactId: pact.id,
      submissionId: submission.id,
      runId: result.runId,
      receiptId: receipt.id,
      receiptHash,
      decision: decision.decision,
      reason: decision.reason,
      attempts: result.attempts,
      authorizedCostUsdc: result.authorizedCostUsdc,
      settledCostUsdc: result.settledCostUsdc,
    });
  } finally {
    await Promise.all([attemptStore.close(), managedFetch.close()]);
  }
}
