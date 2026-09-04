import { buildFraudQuestion, type SecureDeliveryFraudInput } from "./fraud-verification";
import { sha256Hex, type JsonValue } from "@/shared/json/canonical-json";
import type { TelegraphEngineResult, TelegraphIntent } from "@/infrastructure/telegraph/engine-client";

export type SecureDeliveryIntent = Exclude<TelegraphIntent, "FRAUD_DETECTION">;

export type StrictVerificationRecord = Readonly<{
  pactId: string;
  attemptNumber: number;
  intent: SecureDeliveryIntent;
  queryHash: `0x${string}`;
  artifactHash: `0x${string}`;
  minerId: string;
  minerName: string;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  confidence: number;
  signalHash: `0x${string}`;
  rawResponseHash: `0x${string}`;
  costUsd: number;
  durationMs: number;
  observedAt: string;
  paymentReference?: string;
  paymentResponseHash?: `0x${string}`;
  warnings: readonly string[];
}>;

const QUERIES: Readonly<Record<SecureDeliveryIntent, string>> = Object.freeze({
  CVE_LOOKUP: "CVE_LOOKUP: Inspect the submitted repository commit and claimed remediation for known applicable vulnerabilities. Return structured vulnerability status, confidence, and evidence. Abstain when the artifact or evidence cannot be verified.",
  URL_SCAN: "URL_SCAN: Inspect the submitted deployment URL for malicious behavior, phishing, malware, deceptive redirects, and unsafe content. Return a structured safety status, confidence, and evidence. Abstain when the URL cannot be inspected.",
  SSL_VERIFICATION: "SSL_VERIFICATION: Verify the submitted deployment URL certificate, hostname binding, validity window, trust chain, and revocation status. Return structured certificate validity, confidence, and evidence. Abstain when verification is incomplete.",
});

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function confidence(payload: Record<string, unknown>): number {
  return typeof payload.confidence === "number"
    && Number.isFinite(payload.confidence)
    && payload.confidence >= 0
    && payload.confidence <= 1
    ? payload.confidence
    : 0;
}

function normalize(intent: SecureDeliveryIntent, result: JsonValue): Pick<StrictVerificationRecord, "verdict" | "confidence"> {
  const outer = record(result);
  const payload = record(outer?.signal) ?? outer;
  if (!payload) return { verdict: "INCONCLUSIVE", confidence: 0 };
  const score = confidence(payload);

  if (intent === "CVE_LOOKUP") {
    if (typeof payload.vulnerable === "boolean") return { verdict: payload.vulnerable ? "FAIL" : "PASS", confidence: score };
    const value = payload.vulnerability_status ?? payload.status ?? payload.verdict;
    if (typeof value !== "string") return { verdict: "INCONCLUSIVE", confidence: score };
    const status = value.trim().toUpperCase();
    if (["FIXED", "NOT_AFFECTED", "NO_KNOWN_VULNERABILITIES", "PASS", "SAFE"].includes(status)) return { verdict: "PASS", confidence: score };
    if (["AFFECTED", "VULNERABLE", "UNPATCHED", "EXPLOITABLE", "FAIL", "CRITICAL", "HIGH"].includes(status)) return { verdict: "FAIL", confidence: score };
  }

  if (intent === "URL_SCAN") {
    if (typeof payload.malicious === "boolean") return { verdict: payload.malicious ? "FAIL" : "PASS", confidence: score };
    const value = payload.safety_status ?? payload.status ?? payload.verdict;
    if (typeof value !== "string") return { verdict: "INCONCLUSIVE", confidence: score };
    const status = value.trim().toUpperCase();
    if (["CLEAN", "SAFE", "BENIGN", "PASS"].includes(status)) return { verdict: "PASS", confidence: score };
    if (["MALICIOUS", "PHISHING", "MALWARE", "UNSAFE", "BLOCK", "FAIL"].includes(status)) return { verdict: "FAIL", confidence: score };
  }

  if (intent === "SSL_VERIFICATION") {
    if (typeof payload.valid === "boolean") return { verdict: payload.valid ? "PASS" : "FAIL", confidence: score };
    const value = payload.certificate_status ?? payload.status ?? payload.verdict;
    if (typeof value !== "string") return { verdict: "INCONCLUSIVE", confidence: score };
    const status = value.trim().toUpperCase();
    if (["VALID", "TRUSTED", "SECURE", "PASS"].includes(status)) return { verdict: "PASS", confidence: score };
    if (["INVALID", "EXPIRED", "REVOKED", "UNTRUSTED", "HOSTNAME_MISMATCH", "FAIL"].includes(status)) return { verdict: "FAIL", confidence: score };
  }

  return { verdict: "INCONCLUSIVE", confidence: score };
}

export function buildSecureDeliveryIntentQuestion(intent: SecureDeliveryIntent, input: SecureDeliveryFraudInput): {
  readonly query: string;
  readonly context: JsonValue;
  readonly artifactHash: `0x${string}`;
} {
  const fraudRequest = buildFraudQuestion(input);
  return Object.freeze({
    query: QUERIES[intent],
    context: fraudRequest.context,
    artifactHash: fraudRequest.artifactHash,
  });
}

export function toStrictVerificationRecord(
  intent: SecureDeliveryIntent,
  input: SecureDeliveryFraudInput,
  request: ReturnType<typeof buildSecureDeliveryIntentQuestion>,
  result: TelegraphEngineResult,
  attemptNumber: number,
): StrictVerificationRecord {
  if (result.intent !== intent) throw new TypeError(`Expected ${intent} result but received ${result.intent}`);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
    throw new TypeError("attemptNumber must be between 1 and 3");
  }
  const normalized = normalize(intent, result.result);
  return Object.freeze({
    pactId: input.pactId.trim(),
    attemptNumber,
    intent,
    queryHash: sha256Hex({ query: request.query, context: request.context }),
    artifactHash: request.artifactHash,
    minerId: result.minerId,
    minerName: result.minerName,
    verdict: normalized.verdict,
    confidence: normalized.confidence,
    signalHash: result.signalHash,
    rawResponseHash: result.rawResponseHash,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    observedAt: result.timestamp,
    ...(result.paymentReceipt?.transaction ? { paymentReference: result.paymentReceipt.transaction } : {}),
    ...(result.paymentReceipt ? { paymentResponseHash: result.paymentReceipt.headerHash } : {}),
    warnings: result.warnings,
  });
}
