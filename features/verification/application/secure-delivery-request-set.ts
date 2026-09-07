import { buildFraudQuestion, type SecureDeliveryFraudInput } from "./fraud-verification";
import { buildSecureDeliveryIntentQuestion } from "./secure-delivery-intents";
import type { VerificationIntent } from "../domain/verification";
import type { JsonValue } from "@/shared/json/canonical-json";
import type { TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import { buildGenericPolicyRequestSet } from "./policy-verification";
import type { PactVerificationInput } from "./submission-verification-input";

export type SecureDeliveryRequest = Readonly<{
  intent: TelegraphIntent;
  query: string;
  context: JsonValue;
  artifactHash: `0x${string}`;
}>;

export function selectSecureDeliveryIntents(input: SecureDeliveryFraudInput): readonly VerificationIntent[] {
  return Object.freeze([
    "FRAUD_DETECTION",
    "URL_SCAN",
    "SSL_VERIFICATION",
  ]);
}

export function buildSecureDeliveryRequestSet(input: SecureDeliveryFraudInput): readonly SecureDeliveryRequest[] {
  const fraud = buildFraudQuestion(input);
  const requests = selectSecureDeliveryIntents(input).map((intent): SecureDeliveryRequest => {
    if (intent === "FRAUD_DETECTION") return Object.freeze({ intent, ...fraud });
    return Object.freeze({ intent, ...buildSecureDeliveryIntentQuestion(intent, input) });
  });
  if (new Set(requests.map((request) => request.artifactHash)).size !== 1) {
    throw new TypeError("Secure Delivery requests do not share one artifact commitment");
  }
  return Object.freeze(requests);
}

export function buildPactVerificationRequestSet(input: PactVerificationInput): readonly SecureDeliveryRequest[] {
  return "policyPackId" in input
    ? buildGenericPolicyRequestSet(input)
    : buildSecureDeliveryRequestSet(input);
}
