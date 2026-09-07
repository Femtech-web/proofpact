import { canonicalJson, type JsonValue } from "@/shared/json/canonical-json";

const MAX_CAPTURE_BYTES = 24 * 1024;
const SENSITIVE_KEY = /authorization|cookie|password|private.?key|secret|token/i;

export type ResponseEvidence = Readonly<
  | { status: "CAPTURED"; byteLength: number; value: JsonValue }
  | { status: "OMITTED_OVERSIZED"; byteLength: number; redactedPreview: string }
>;

function redact(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(child);
  }
  return result;
}

/**
 * Keeps enough bounded Miner output to diagnose schema mismatches. The exact,
 * unmodified response remains committed by rawResponseHash.
 */
export function captureResponseEvidence(value: JsonValue): ResponseEvidence {
  const safe = redact(value);
  const serialized = canonicalJson(safe);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > MAX_CAPTURE_BYTES) return Object.freeze({
    status: "OMITTED_OVERSIZED",
    byteLength,
    redactedPreview: `${serialized.slice(0, 6_000)}\n...[bounded middle omitted]...\n${serialized.slice(-1_500)}`,
  });
  return Object.freeze({ status: "CAPTURED", byteLength, value: safe });
}
