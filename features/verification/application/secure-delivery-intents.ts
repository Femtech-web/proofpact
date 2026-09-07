import { buildFraudQuestion, type SecureDeliveryFraudInput } from "./fraud-verification";
import { sha256Hex, type JsonValue } from "@/shared/json/canonical-json";
import type { TelegraphEngineResult, TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import type { MinerSignalMapping } from "@/infrastructure/telegraph/miner-signal-map";
import { normalizeRoutedResult, type NormalizedRoutedResult } from "./routed-result-normalizer";
import { captureResponseEvidence, type ResponseEvidence } from "./response-evidence";

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
  responseEvidence: ResponseEvidence;
  costUsd: number;
  durationMs: number;
  observedAt: string;
  paymentReference?: string;
  paymentResponseHash?: `0x${string}`;
  warnings: readonly string[];
}>;

function query(intent: SecureDeliveryIntent, input: SecureDeliveryFraudInput): string {
  const responseContract = "Return JSON with verdict PASS, FAIL, or INCONCLUSIVE; confidence from 0 to 1; and a concise evidence-based reason.";
  if (intent === "CVE_LOOKUP") return [
    "CVE_LOOKUP: Check the public software artifact and remediation claim for known applicable critical or high-severity vulnerabilities.",
    `Repository: ${input.repositoryUrl}`,
    `Exact commit: ${input.commitSha}`,
    `Deployment URL: ${input.deploymentUrl}`,
    `Claimed remediation: ${input.claimedRemediation}`,
    "Validate any CVE identifiers named in the claim. Use INCONCLUSIVE if the repository, commit, dependency evidence, or named CVE cannot be inspected; do not infer that no vulnerabilities exist.",
    responseContract,
  ].join("\n");
  if (intent === "FACT_CHECK") return [
    "FACT_CHECK: Verify the worker's concrete delivery claim against this exact immutable public commit page and deployed URL.",
    `Exact commit permalink: ${buildCommitEvidenceUrl(input.repositoryUrl, input.commitSha)}`,
    `Repository: ${input.repositoryUrl}`,
    `Exact commit: ${input.commitSha}`,
    `Deployment URL: ${input.deploymentUrl}`,
    `Claimed remediation: ${input.claimedRemediation}`,
    "Use the exact commit permalink as the primary source. Do not substitute search snippets, branches, similarly named repositories, or unrelated pages.",
    "PASS only when the exact commit page identifies this repository and SHA and its visible changes support the concrete claim. FAIL when it is missing, mismatched, or contradicts the claim. Use INCONCLUSIVE when the exact source cannot be inspected.",
    responseContract,
  ].join("\n");
  if (intent === "WEB_SEARCH") return [
    "WEB_SEARCH: Inspect the exact public source-control evidence for this software delivery.",
    `Exact commit permalink: ${buildCommitEvidenceUrl(input.repositoryUrl, input.commitSha)}`,
    `Repository: ${input.repositoryUrl}`,
    `Exact commit SHA: ${input.commitSha}`,
    `Deployment URL: ${input.deploymentUrl}`,
    `Claimed remediation: ${input.claimedRemediation}`,
    "Use the exact commit permalink as the primary source. Confirm that the page resolves to the submitted repository and full commit SHA. Do not substitute similarly named repositories, branches, search snippets, or Wikipedia.",
    "PASS only when the exact public commit is inspectable and supports the concrete delivery claim. FAIL when the commit is missing, belongs to another repository, or contradicts the claim. Use INCONCLUSIVE when the exact source cannot be inspected.",
    responseContract,
  ].join("\n");
  if (intent === "CONTENT_EXTRACTION") return [
    "CONTENT_EXTRACTION: Read this exact immutable source-control page live.",
    `URL: ${buildCommitEvidenceUrl(input.repositoryUrl, input.commitSha)}`,
    "Return the page URL, title, body excerpt, character count, read timestamp, and confidence. Do not search for substitutes or summarize another page.",
  ].join("\n");
  if (intent === "AGENT_TASK") return [
    "AGENT_TASK: Evaluate whether this software worker completed the claimed delivery against the exact public artifact coordinates.",
    `Repository: ${input.repositoryUrl}`,
    `Exact commit: ${input.commitSha}`,
    `Deployment URL: ${input.deploymentUrl}`,
    `Claimed outcome: ${input.claimedRemediation}`,
    "PASS only when the repository, commit, deployed result, and claim form a coherent completed task. FAIL for a mismatch or contradicted claim. Use INCONCLUSIVE when the public artifacts cannot be inspected.",
    responseContract,
  ].join("\n");
  if (intent === "URL_SCAN") return [
    "URL_SCAN: Inspect this exact deployed URL for phishing, malware, malicious behavior, deceptive redirects, and unsafe content.",
    `Deployment URL: ${input.deploymentUrl}`,
    `Expected repository: ${input.repositoryUrl}`,
    `Expected commit: ${input.commitSha}`,
    "Use INCONCLUSIVE if the URL cannot be fetched or matched to the supplied delivery evidence.",
    responseContract,
  ].join("\n");
  return [
    "SSL_VERIFICATION: Verify the TLS certificate for this exact deployed URL, including hostname binding, validity window, trust chain, and revocation status.",
    `Deployment URL: ${input.deploymentUrl}`,
    "PASS requires a currently valid trusted certificate for the deployment hostname. Use INCONCLUSIVE when a live handshake or required certificate evidence is unavailable.",
    responseContract,
  ].join("\n");
}

function record(value: JsonValue): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : undefined;
}

function comparableUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "").toLowerCase();
}

const CLAIM_STOP_WORDS = new Set([
  "added", "and", "behavior", "changes", "completed", "deployed", "existing", "for", "from", "hardened",
  "preserving", "reviewed", "submitted", "the", "this", "while", "with", "work",
]);

function evidenceTerms(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/)
    .map((term) => term.endsWith("s") && term.length > 4 ? term.slice(0, -1) : term)
    .filter((term) => term.length >= 3 && !CLAIM_STOP_WORDS.has(term)));
}

function normalizeCommitExtraction(
  input: SecureDeliveryFraudInput,
  result: JsonValue,
): NormalizedRoutedResult {
  const payload = record(result);
  if (!payload) return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "ABSTAINED" });
  const returnedUrl = typeof payload.url === "string" ? payload.url : undefined;
  const confidence = typeof payload.confidence === "number" && payload.confidence >= 0 && payload.confidence <= 1
    ? payload.confidence
    : 0;
  if (!returnedUrl) return Object.freeze({ verdict: "INCONCLUSIVE", confidence, normalization: "ABSTAINED" });
  const expectedUrl = buildCommitEvidenceUrl(input.repositoryUrl, input.commitSha);
  try {
    if (comparableUrl(returnedUrl) !== comparableUrl(expectedUrl)) {
      return Object.freeze({ verdict: "FAIL", confidence, normalization: "STRICT_STRUCTURED" });
    }
  } catch {
    return Object.freeze({ verdict: "INCONCLUSIVE", confidence: 0, normalization: "ABSTAINED" });
  }
  const corpus = [payload.title, payload.summary, payload.excerpt]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const repository = new URL(input.repositoryUrl).pathname.replace(/\.git$/i, "").replace(/^\//, "").toLowerCase();
  const repositoryName = repository.split("/").at(-1) ?? "";
  const shortSha = input.commitSha.slice(0, 7).toLowerCase();
  if ((!corpus.includes(repository) && !corpus.includes(repositoryName)) || !corpus.includes(shortSha)) {
    return Object.freeze({ verdict: "INCONCLUSIVE", confidence, normalization: "STRICT_STRUCTURED" });
  }
  const claimTerms = evidenceTerms(input.claimedRemediation);
  const pageTerms = evidenceTerms(corpus);
  const overlap = [...claimTerms].filter((term) => pageTerms.has(term)).length;
  const requiredOverlap = Math.min(2, claimTerms.size);
  if (requiredOverlap > 0 && overlap < requiredOverlap) {
    return Object.freeze({ verdict: "INCONCLUSIVE", confidence, normalization: "STRICT_STRUCTURED" });
  }
  return Object.freeze({ verdict: "PASS", confidence, normalization: "STRICT_STRUCTURED" });
}

export function buildCommitEvidenceUrl(repositoryUrl: string, commitSha: string): string {
  const repository = new URL(repositoryUrl);
  const sha = commitSha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new TypeError("commit SHA must contain 7 to 40 hexadecimal characters");
  const segments = repository.pathname.split("/").filter(Boolean);
  if (segments.length < 2) throw new TypeError("repository URL must identify an owner and repository");
  const root = `${repository.origin}/${segments[0]}/${segments[1]!.replace(/\.git$/i, "")}`;
  if (repository.hostname.toLowerCase() === "github.com") return `${root}/commit/${sha}`;
  if (repository.hostname.toLowerCase() === "gitlab.com") return `${root}/-/commit/${sha}`;
  if (repository.hostname.toLowerCase() === "bitbucket.org") return `${root}/commits/${sha}`;
  throw new TypeError("Secure Delivery repository evidence currently supports GitHub, GitLab, or Bitbucket");
}

export function buildSecureDeliveryIntentQuestion(intent: SecureDeliveryIntent, input: SecureDeliveryFraudInput): {
  readonly query: string;
  readonly context: JsonValue;
  readonly artifactHash: `0x${string}`;
} {
  const fraudRequest = buildFraudQuestion(input);
  return Object.freeze({
    query: query(intent, input),
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
  mapping?: MinerSignalMapping,
  normalizedResult?: NormalizedRoutedResult,
): StrictVerificationRecord {
  if (result.intent !== intent) throw new TypeError(`Expected ${intent} result but received ${result.intent}`);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 3) {
    throw new TypeError("attemptNumber must be between 1 and 3");
  }
  const normalized = normalizedResult
    ?? (intent === "CONTENT_EXTRACTION" ? normalizeCommitExtraction(input, result.result) : normalizeRoutedResult(intent, result.result, mapping));
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
    responseEvidence: captureResponseEvidence(result.result),
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    observedAt: result.timestamp,
    ...(result.paymentReceipt?.transaction ? { paymentReference: result.paymentReceipt.transaction } : {}),
    ...(result.paymentReceipt ? { paymentResponseHash: result.paymentReceipt.headerHash } : {}),
    warnings: Object.freeze([...result.warnings, `NORMALIZATION_${normalized.normalization}`]),
  });
}
