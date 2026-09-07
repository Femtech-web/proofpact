import "server-only";

import { buildFraudQuestion, toFraudVerificationRecord, type SecureDeliveryFraudInput } from "@/features/verification/application/fraud-verification";
import { runPaidFraudVerification, type PaidFraudRunResult } from "@/features/verification/application/run-paid-fraud-verification";
import type { VerificationAttemptStore } from "@/features/verification/application/verification-attempt-store";
import { createAuthorizedX402Fetch, type AuthorizedPayment } from "@/infrastructure/x402/authorized-fetch";
import { createFraudEngineClient } from "./engine-client";

export type LiveFraudVerifierOptions = Readonly<{
  nodeUrl: string;
  baseSepoliaRpcUrl: string;
  payerPrivateKey: `0x${string}`;
  maxCostUsdc: number;
  maxAuthorizedCostUsdc: number;
  maxAttempts: number;
  requiredDistinctResults: number;
  attemptStore: VerificationAttemptStore;
  authorizePayment: (payment: AuthorizedPayment) => boolean | Promise<boolean>;
  reconcileAuthorizedFailure?: Parameters<typeof runPaidFraudVerification>[0]["reconcileAuthorizedFailure"];
  retryDelayMs?: Parameters<typeof runPaidFraudVerification>[0]["retryDelayMs"];
  fetchImpl?: typeof fetch;
}>;

export function createLiveFraudVerifier(options: LiveFraudVerifierOptions) {
  return Object.freeze({
    async verify(input: SecureDeliveryFraudInput, signal: AbortSignal, runId?: string): Promise<PaidFraudRunResult> {
      return runPaidFraudVerification({
        ...(runId ? { runId } : {}),
        input,
        maxAttempts: options.maxAttempts,
        requiredDistinctResults: options.requiredDistinctResults,
        maxAuthorizedCostUsdc: options.maxAuthorizedCostUsdc,
        attemptStore: options.attemptStore,
        authorizePayment: options.authorizePayment,
        ...(options.reconcileAuthorizedFailure
          ? { reconcileAuthorizedFailure: options.reconcileAuthorizedFailure }
          : {}),
        ...(options.retryDelayMs ? { retryDelayMs: options.retryDelayMs } : {}),
        attempt: async ({ attemptNumber, authorizePayment }) => {
          const paidFetch = createAuthorizedX402Fetch({
            privateKey: options.payerPrivateKey,
            maxCostUsdc: options.maxCostUsdc,
            baseSepoliaRpcUrl: options.baseSepoliaRpcUrl,
            authorizePayment,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          });
          const engine = createFraudEngineClient({
            nodeUrl: options.nodeUrl,
            maxCostUsdc: options.maxCostUsdc,
            fetchImpl: paidFetch,
          });
          const request = buildFraudQuestion(input);
          const result = await engine.askFraud({ query: request.query, context: request.context }, signal);
          return toFraudVerificationRecord(input, request, result, attemptNumber);
        },
      });
    },
  });
}
