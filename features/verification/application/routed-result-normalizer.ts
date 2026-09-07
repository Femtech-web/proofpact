import type { JsonValue } from "@/shared/json/canonical-json";
import type { TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import { readMappedField, type MinerSignalMapping } from "@/infrastructure/telegraph/miner-signal-map";

export type NormalizedRoutedResult = Readonly<{
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  confidence: number;
  normalization: "STRICT_STRUCTURED" | "DECLARED_MAPPING" | "PROSE_MODEL" | "ABSTAINED";
}>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function jsonObjectPrefix(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text.startsWith("{")) return undefined;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return record(JSON.parse(text.slice(0, index + 1)) as unknown);
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function unitInterval(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
}

function labelVerdict(intent: TelegraphIntent, field: string, value: unknown): "PASS" | "FAIL" | "INCONCLUSIVE" | undefined {
  const leaf = field.split(".").at(-1)?.toLowerCase() ?? "";
  if (typeof value === "boolean") {
    if (["valid", "safe", "clean", "fixed", "trusted", "legitimate", "completed", "supported", "accurate"].includes(leaf)) return value ? "PASS" : "FAIL";
    if (["fraudulent", "malicious", "vulnerable", "unsafe", "phishing", "revoked", "expired"].includes(leaf)) return value ? "FAIL" : "PASS";
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const label = value.trim().toUpperCase();
  const pass = new Set(["ALLOW", "PASS", "SAFE", "BENIGN", "LEGITIMATE", "LOW", "CLEAN", "CLEAR", "OK", "FIXED", "NOT_AFFECTED", "NOT_VULNERABLE", "NO_ISSUES", "NO_THREATS", "NO_VULNERABILITIES", "NO_KNOWN_VULNERABILITIES", "VALID", "VALID_CERTIFICATE", "TRUSTED", "SECURE"]);
  const fail = new Set(["BLOCK", "FAIL", "FRAUD", "FRAUDULENT", "MALICIOUS", "DANGEROUS", "COMPROMISED", "THREAT", "HIGH", "CRITICAL", "AFFECTED", "VULNERABLE", "VULNERABILITIES_FOUND", "UNPATCHED", "EXPLOITABLE", "PHISHING", "MALWARE", "UNSAFE", "INVALID", "EXPIRED", "REVOKED", "UNTRUSTED", "HOSTNAME_MISMATCH"]);
  const inconclusive = new Set(["WARN", "WARNING", "MEDIUM", "ELEVATED", "SUSPICIOUS", "UNKNOWN", "INCONCLUSIVE", "UNVERIFIED", "NOT_CHECKED"]);
  if (pass.has(label)) return "PASS";
  if (fail.has(label)) return "FAIL";
  if (inconclusive.has(label)) return "INCONCLUSIVE";
  if (intent === "FRAUD_DETECTION" && label === "NO_FRAUD") return "PASS";
  return undefined;
}

function strictFields(intent: TelegraphIntent, payload: Record<string, unknown>): { field: string; value: unknown }[] {
  if (intent === "FRAUD_DETECTION") return [
    { field: "fraudulent", value: payload.fraudulent },
    { field: "verdict", value: payload.verdict },
    { field: "gate_decision", value: payload.gate_decision },
    { field: "risk_level", value: payload.risk_level },
  ];
  if (intent === "CVE_LOOKUP") return [
    { field: "vulnerable", value: payload.vulnerable },
    { field: "vulnerability_status", value: payload.vulnerability_status },
    { field: "status", value: payload.status },
    { field: "verdict", value: payload.verdict },
  ];
  if (intent === "URL_SCAN") return [
    { field: "malicious", value: payload.malicious },
    { field: "safety_status", value: payload.safety_status },
    { field: "status", value: payload.status },
    { field: "verdict", value: payload.verdict },
  ];
  if (intent === "WEB_SEARCH") return [
    { field: "verdict", value: payload.verdict },
    { field: "outcome", value: payload.outcome },
    { field: "supported", value: payload.supported },
    { field: "accurate", value: payload.accurate },
  ];
  if (intent === "FACT_CHECK" || intent === "AGENT_TASK") return [
    { field: "verdict", value: payload.verdict },
    { field: "outcome", value: payload.outcome },
    { field: "completed", value: payload.completed },
    { field: "supported", value: payload.supported },
    { field: "accurate", value: payload.accurate },
  ];
  return [
    { field: "valid", value: payload.valid },
    { field: "certificate_status", value: payload.certificate_status },
    { field: "status", value: payload.status },
    { field: "verdict", value: payload.verdict },
  ];
}

function inferredConfidence(intent: TelegraphIntent, payload: Record<string, unknown>, verdict: "PASS" | "FAIL" | "INCONCLUSIVE"): number {
  const declared = unitInterval(payload.confidence);
  if (declared !== undefined) return declared;
  if (intent === "URL_SCAN") {
    const risk = unitInterval(payload.risk);
    if (risk !== undefined) return verdict === "PASS" ? 1 - risk : verdict === "FAIL" ? risk : 0;
  }
  return 0;
}

function normalizeSslLabs(payload: Record<string, unknown>): NormalizedRoutedResult | undefined {
  const status = typeof payload.status === "string" ? payload.status.trim().toUpperCase() : "";
  if (["DNS", "IN_PROGRESS", "STARTING", "RUNNING"].includes(status)) {
    return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "STRICT_STRUCTURED" });
  }
  if (status !== "READY" || !Array.isArray(payload.endpoints) || payload.endpoints.length === 0) return undefined;
  const grades = payload.endpoints
    .map((endpoint) => record(endpoint)?.grade)
    .filter((grade): grade is string => typeof grade === "string")
    .map((grade) => grade.trim().toUpperCase());
  if (grades.length === 0) {
    return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "STRICT_STRUCTURED" });
  }
  if (grades.some((grade) => grade === "T" || grade === "M")) {
    return Object.freeze({ verdict: "FAIL", confidence: 0.95, normalization: "STRICT_STRUCTURED" });
  }
  if (grades.every((grade) => /^(A\+|A-|A|B|C|D|E|F)$/.test(grade))) {
    return Object.freeze({ verdict: "PASS", confidence: 0.9, normalization: "STRICT_STRUCTURED" });
  }
  return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "STRICT_STRUCTURED" });
}

export function normalizeRoutedResult(
  intent: TelegraphIntent,
  result: JsonValue,
  mapping?: MinerSignalMapping,
): NormalizedRoutedResult {
  const outer = record(result);
  const payload = intent === "WEB_SEARCH" || intent === "FACT_CHECK"
    ? jsonObjectPrefix(outer?.answer) ?? jsonObjectPrefix(outer?.summary) ?? record(outer?.signal) ?? outer
    : record(outer?.signal) ?? outer;
  if (!payload) return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "ABSTAINED" });

  if (intent === "SSL_VERIFICATION") {
    const sslLabs = normalizeSslLabs(payload);
    if (sslLabs) return sslLabs;
  }

  for (const candidate of strictFields(intent, payload)) {
    const verdict = labelVerdict(intent, candidate.field, candidate.value);
    if (verdict) return Object.freeze({
      verdict,
      confidence: inferredConfidence(intent, payload, verdict),
      normalization: "STRICT_STRUCTURED",
    });
  }

  if (mapping?.labelField) {
    const mappedValue = readMappedField(outer ?? payload, mapping.labelField)
      ?? readMappedField(payload, mapping.labelField.replace(/^signal\./, ""));
    const verdict = labelVerdict(intent, mapping.labelField, mappedValue);
    if (verdict) {
      const mappedConfidence = mapping.confidenceField
        ? readMappedField(outer ?? payload, mapping.confidenceField)
          ?? readMappedField(payload, mapping.confidenceField.replace(/^signal\./, ""))
        : undefined;
      return Object.freeze({
        verdict,
        confidence: unitInterval(mappedConfidence) ?? inferredConfidence(intent, payload, verdict),
        normalization: "DECLARED_MAPPING",
      });
    }
  }

  return Object.freeze({
    verdict: "INCONCLUSIVE",
    confidence: unitInterval(payload.confidence) ?? 0,
    normalization: "ABSTAINED",
  });
}

function proseFromResult(result: JsonValue, mapping?: MinerSignalMapping): string | undefined {
  if (typeof result === "string") return result.trim() || undefined;
  const outer = record(result);
  const payload = record(outer?.signal) ?? outer;
  if (!payload) return undefined;
  const candidates: unknown[] = [];
  if (mapping?.labelField) {
    candidates.push(
      readMappedField(outer ?? payload, mapping.labelField),
      readMappedField(payload, mapping.labelField.replace(/^signal\./, "")),
    );
  }
  for (const key of ["answer", "summary", "reasoning", "reason", "message", "text", "explanation", "description"]) {
    candidates.push(payload[key]);
  }
  return candidates.find((value): value is string => typeof value === "string" && value.trim() !== "")?.trim();
}

export async function normalizeRoutedResultWithProse(
  intent: TelegraphIntent,
  result: JsonValue,
  mapping: MinerSignalMapping | undefined,
  signal: AbortSignal,
): Promise<NormalizedRoutedResult> {
  const deterministic = normalizeRoutedResult(intent, result, mapping);
  if (deterministic.normalization !== "ABSTAINED") return deterministic;
  const prose = proseFromResult(result, mapping);
  if (!prose) return deterministic;
  const { normalizeMinerProse } = await import("./prose-normalizer");
  const translated = await normalizeMinerProse(intent, prose, signal);
  return translated
    ? Object.freeze({ ...translated, normalization: "PROSE_MODEL" })
    : deterministic;
}
