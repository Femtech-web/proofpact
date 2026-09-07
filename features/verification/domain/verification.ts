export const CORE_VERIFICATION_INTENTS = [
  "FRAUD_DETECTION",
  "CVE_LOOKUP",
  "URL_SCAN",
  "SSL_VERIFICATION",
] as const;

export const SUPPORTING_VERIFICATION_INTENTS = ["FACT_CHECK", "WEB_SEARCH", "CONTENT_EXTRACTION", "AGENT_TASK"] as const;

export type VerificationIntent =
  | (typeof CORE_VERIFICATION_INTENTS)[number]
  | (typeof SUPPORTING_VERIFICATION_INTENTS)[number];

export type VerificationSignal = Readonly<{
  intent: VerificationIntent;
  minerId: string;
  signalHash: `0x${string}`;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  confidence: number;
  observedAt: string;
}>;

export function uniqueMinerSignals(signals: readonly VerificationSignal[]): VerificationSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const identity = `${signal.intent}:${signal.minerId.trim().toLowerCase()}`;
    if (identity.length === 0 || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
