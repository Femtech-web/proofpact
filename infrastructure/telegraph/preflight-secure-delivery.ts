import "server-only";

import type { PactVerificationInput } from "@/features/verification/application/submission-verification-input";
import { buildPactVerificationRequestSet } from "@/features/verification/application/secure-delivery-request-set";
import { selectBaseSepoliaPayment, type X402PaymentOption } from "@/infrastructure/x402/payment-policy";
import { createTelegraphEngineClient, TelegraphEngineError, type TelegraphIntent } from "./engine-client";
import { verifyGithubCommit, type SourceCommitProof } from "@/infrastructure/source/github-commit-verifier";

export type SecureDeliveryChallenge = Readonly<{
  intent: TelegraphIntent;
  artifactHash: `0x${string}`;
  payment: X402PaymentOption;
}>;

export async function preflightSecureDelivery(options: Readonly<{
  input: PactVerificationInput;
  nodeUrl: string;
  maxCostUsdcPerIntent: number;
  maxTotalCostUsdc: number;
  fetchImpl?: typeof fetch;
  signal: AbortSignal;
}>): Promise<Readonly<{ challenges: readonly SecureDeliveryChallenge[]; totalCostUsdc: number; sourceProof?: SourceCommitProof }>> {
  const sourceProof = "policyPackId" in options.input
    ? undefined
    : await verifyGithubCommit(options.input, options.signal, options.fetchImpl);
  const requests = buildPactVerificationRequestSet(options.input);
  const client = createTelegraphEngineClient({
    nodeUrl: options.nodeUrl,
    maxCostUsdc: options.maxCostUsdcPerIntent,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const challenges = await Promise.all(requests.map(async (request): Promise<SecureDeliveryChallenge> => {
    try {
      await client.ask({ query: request.query, context: request.context }, request.intent, options.signal);
      throw new Error(`${request.intent} did not return the required x402 challenge`);
    } catch (error) {
      if (!(error instanceof TelegraphEngineError) || error.code !== "PAYMENT_REQUIRED" || !error.paymentRequired) throw error;
      return Object.freeze({
        intent: request.intent,
        artifactHash: request.artifactHash,
        payment: selectBaseSepoliaPayment(error.paymentRequired, options.maxCostUsdcPerIntent),
      });
    }
  }));
  const totalUnits = challenges.reduce((sum, challenge) => sum + BigInt(challenge.payment.amount), 0n);
  const maximumUnits = BigInt(Math.floor(options.maxTotalCostUsdc * 1_000_000 + Number.EPSILON));
  if (totalUnits > maximumUnits) throw new TypeError("Policy x402 challenge total exceeds the configured cumulative ceiling");
  return Object.freeze({
    challenges: Object.freeze(challenges),
    totalCostUsdc: Number(totalUnits) / 1_000_000,
    ...(sourceProof ? { sourceProof } : {}),
  });
}
