import type { Receipt } from "@/features/jobs/application/pact-store";
import type { VerificationSignal } from "@/features/verification/domain/verification";
import type { JsonValue } from "@/shared/json/canonical-json";

export type ComposedEvidenceRecord = Readonly<{
  intent: VerificationSignal["intent"];
  miner_id: string;
  miner_name: string;
  verdict: "PASS";
  confidence: number;
  signal_hash: `0x${string}`;
  raw_response_hash: `0x${string}`;
  query_hash: `0x${string}`;
  cost_usd: number;
  observed_at: string;
  payment_reference?: string;
  normalization?: string;
  response_evidence?: JsonValue;
  source_receipt_id: string;
}>;

const HASH = /^0x[0-9a-f]{64}$/i;

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

export function composeFreshEvidence(options: Readonly<{
  receipts: readonly Receipt[];
  submissionId: string;
  artifactHash: `0x${string}`;
  policyPackId: string;
  policyVersion: string;
  requiredIntents: readonly VerificationSignal["intent"][];
  expectedQueryHashes: ReadonlyMap<VerificationSignal["intent"], `0x${string}`>;
  now: Date;
  maxAgeMs: number;
}>): Readonly<{ records: readonly ComposedEvidenceRecord[]; signals: readonly VerificationSignal[]; sourceReceiptIds: readonly string[] }> {
  if (!Number.isSafeInteger(options.maxAgeMs) || options.maxAgeMs < 1 || options.maxAgeMs > 24 * 60 * 60_000) {
    throw new TypeError("maxAgeMs must be between one millisecond and 24 hours");
  }
  const nowMs = options.now.getTime();
  if (!Number.isFinite(nowMs)) throw new TypeError("now must be a valid date");
  const candidates: ComposedEvidenceRecord[] = [];
  for (const receipt of options.receipts) {
    if (receipt.submissionId !== options.submissionId || receipt.artifactHash !== options.artifactHash) continue;
    const payload = object(receipt.payload);
    if (!payload || payload.policy_pack !== options.policyPackId || payload.policy_version !== options.policyVersion
      || !sameStrings(payload.required_intents, options.requiredIntents)) continue;
    if (!Array.isArray(payload.records)) continue;
    for (const value of payload.records) {
      const record = object(value);
      if (!record || record.verdict !== "PASS" || typeof record.intent !== "string"
        || !options.requiredIntents.includes(record.intent as VerificationSignal["intent"])
        || typeof record.miner_id !== "string" || !record.miner_id.trim()
        || typeof record.miner_name !== "string" || !record.miner_name.trim()
        || typeof record.confidence !== "number" || record.confidence < 0.75 || record.confidence > 1
        || typeof record.signal_hash !== "string" || !HASH.test(record.signal_hash)
        || typeof record.raw_response_hash !== "string" || !HASH.test(record.raw_response_hash)
        || typeof record.query_hash !== "string" || !HASH.test(record.query_hash)
        || options.expectedQueryHashes.get(record.intent as VerificationSignal["intent"]) !== record.query_hash
        || typeof record.cost_usd !== "number" || record.cost_usd < 0
        || typeof record.observed_at !== "string") continue;
      const observedMs = Date.parse(record.observed_at);
      if (!Number.isFinite(observedMs) || observedMs > nowMs + 5 * 60_000 || nowMs - observedMs > options.maxAgeMs) continue;
      candidates.push(Object.freeze({
        intent: record.intent as VerificationSignal["intent"],
        miner_id: record.miner_id,
        miner_name: record.miner_name,
        verdict: "PASS",
        confidence: record.confidence,
        signal_hash: record.signal_hash as `0x${string}`,
        raw_response_hash: record.raw_response_hash as `0x${string}`,
        query_hash: record.query_hash as `0x${string}`,
        cost_usd: record.cost_usd,
        observed_at: record.observed_at,
        ...(typeof record.payment_reference === "string" ? { payment_reference: record.payment_reference } : {}),
        ...(typeof record.normalization === "string" ? { normalization: record.normalization } : {}),
        ...(record.response_evidence !== undefined ? { response_evidence: record.response_evidence as JsonValue } : {}),
        source_receipt_id: receipt.id,
      }));
    }
  }
  const records = options.requiredIntents.map((intent) => candidates
    .filter((candidate) => candidate.intent === intent)
    .sort((left, right) => Date.parse(right.observed_at) - Date.parse(left.observed_at))[0]);
  if (records.some((record) => !record)) throw new Error("Fresh conclusive evidence is not available for every required intent");
  const complete = records as ComposedEvidenceRecord[];
  const signals = complete.map((record): VerificationSignal => Object.freeze({
    intent: record.intent,
    minerId: record.miner_id,
    signalHash: record.signal_hash,
    verdict: record.verdict,
    confidence: record.confidence,
    observedAt: record.observed_at,
  }));
  if (new Set(signals.map((signal) => signal.minerId.trim().toLowerCase())).size < 2) {
    throw new Error("Fresh evidence must include at least two Miner identities");
  }
  return Object.freeze({
    records: Object.freeze(complete),
    signals: Object.freeze(signals),
    sourceReceiptIds: Object.freeze([...new Set(complete.map((record) => record.source_receipt_id))]),
  });
}
