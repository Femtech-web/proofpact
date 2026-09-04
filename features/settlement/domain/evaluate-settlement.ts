import {
  uniqueMinerSignals,
  type VerificationSignal,
} from "@/features/verification/domain/verification";
import { getPolicyPack, type PolicyPackId } from "@/features/policies/domain/policy-pack";

export type SettlementDecision = "RELEASE" | "RETRY" | "HOLD" | "REJECT";

export type SettlementResult = Readonly<{
  decision: SettlementDecision;
  reason: string;
  acceptedSignals: readonly VerificationSignal[];
  missingIntents: readonly string[];
}>;

const MIN_CONFIDENCE = 0.75;

export function evaluateSettlement(
  signals: readonly VerificationSignal[],
  policyPackId: PolicyPackId = "secure-delivery",
): SettlementResult {
  const policyPack = getPolicyPack(policyPackId);
  const uniqueSignals = uniqueMinerSignals(signals);
  const conclusive = uniqueSignals.filter(
    (signal) => signal.verdict !== "INCONCLUSIVE" && signal.confidence >= MIN_CONFIDENCE,
  );
  const satisfied = new Set(conclusive.map((signal) => signal.intent));
  const missingIntents = policyPack.requiredIntents.filter((intent) => !satisfied.has(intent));

  const fraudSignal = conclusive.find((signal) => signal.intent === "FRAUD_DETECTION");
  if (fraudSignal?.verdict === "FAIL") {
    return { decision: "REJECT", reason: "Independent fraud intelligence identified material risk.", acceptedSignals: conclusive, missingIntents };
  }

  if (conclusive.some((signal) => signal.verdict === "FAIL")) {
    return { decision: "HOLD", reason: "At least one required delivery check failed.", acceptedSignals: conclusive, missingIntents };
  }

  if (missingIntents.length > 0) {
    return { decision: "RETRY", reason: "Required independent evidence is missing or inconclusive.", acceptedSignals: conclusive, missingIntents };
  }

  return { decision: "RELEASE", reason: "All required independent checks passed policy.", acceptedSignals: conclusive, missingIntents };
}
