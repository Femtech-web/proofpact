import "server-only";

import type { SecureDeliveryFraudInput } from "@/features/verification/application/fraud-verification";
import {
  buildSecureDeliveryIntentQuestion,
  toStrictVerificationRecord,
  type SecureDeliveryIntent,
  type StrictVerificationRecord,
} from "@/features/verification/application/secure-delivery-intents";
import { createAuthorizedX402Fetch, type AuthorizedPayment } from "@/infrastructure/x402/authorized-fetch";
import { createTelegraphEngineClient } from "./engine-client";

export type LiveSecureDeliveryIntentAdapterOptions = Readonly<{
  intent: SecureDeliveryIntent;
  nodeUrl: string;
  baseSepoliaRpcUrl: string;
  payerPrivateKey: `0x${string}`;
  maxCostUsdc: number;
  fetchImpl?: typeof fetch;
}>;

export function createLiveSecureDeliveryIntentAdapter(options: LiveSecureDeliveryIntentAdapterOptions) {
  return Object.freeze({
    intent: options.intent,
    async verify(
      input: SecureDeliveryFraudInput,
      attemptNumber: number,
      authorizePayment: (payment: AuthorizedPayment) => Promise<boolean>,
      signal: AbortSignal,
    ): Promise<StrictVerificationRecord> {
      const paidFetch = createAuthorizedX402Fetch({
        privateKey: options.payerPrivateKey,
        maxCostUsdc: options.maxCostUsdc,
        baseSepoliaRpcUrl: options.baseSepoliaRpcUrl,
        authorizePayment,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      });
      const engine = createTelegraphEngineClient({
        nodeUrl: options.nodeUrl,
        maxCostUsdc: options.maxCostUsdc,
        fetchImpl: paidFetch,
      });
      const request = buildSecureDeliveryIntentQuestion(options.intent, input);
      const result = await engine.ask(
        { query: request.query, context: request.context },
        options.intent,
        signal,
      );
      return toStrictVerificationRecord(options.intent, input, request, result, attemptNumber);
    },
  });
}
