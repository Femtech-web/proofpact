import { createHash } from "node:crypto";
import { canonicalJson, type JsonValue } from "@/shared/json/canonical-json";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_PAYMENT_FAILURE_BYTES = 8 * 1024;
const MAX_HEADER_BYTES = 16 * 1024;
const SIGNAL_HASH = /^0x[0-9a-fA-F]{64}$/;
const INTENT_LABEL = /^[A-Z][A-Z0-9_]{0,63}$/;

export type TelegraphIntent = "FRAUD_DETECTION" | "CVE_LOOKUP" | "URL_SCAN" | "SSL_VERIFICATION";

export type TelegraphPaymentReceipt = Readonly<{
  headerHash: `0x${string}`;
  success?: boolean;
  transaction?: string;
  network?: string;
}>;

export type TelegraphEngineResult = Readonly<{
  minerId: string;
  minerName: string;
  endpoint: string;
  result: JsonValue;
  costUsd: number;
  durationMs: number;
  timestamp: string;
  intent: TelegraphIntent;
  signalHash: `0x${string}`;
  rawResponseHash: `0x${string}`;
  paymentReceipt?: TelegraphPaymentReceipt;
  warnings: readonly string[];
}>;

export type TelegraphEngineErrorCode =
  | "COST_EXCEEDED"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "PAYMENT_REQUIRED"
  | "TRANSPORT_ERROR";

export type PaymentFailureDiagnostic = Readonly<{
  bodyStatus: "CAPTURED" | "EMPTY" | "OVERSIZED" | "READ_FAILED";
  bodyBytes?: number;
  bodySha256?: `0x${string}`;
  serverError?: string;
  paymentResponsePresent: boolean;
  paymentResponseSha256?: `0x${string}`;
  paymentSuccess?: boolean;
  paymentError?: string;
  paymentTransaction?: string;
  paymentNetwork?: string;
}>;

export class TelegraphEngineError extends Error {
  constructor(
    readonly code: TelegraphEngineErrorCode,
    message: string,
    readonly paymentRequired?: string,
    readonly paymentFailure?: PaymentFailureDiagnostic,
  ) {
    super(message);
  }
}

function safeServerError(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[^\x20-\x7e]/g, "?");
  return normalized ? normalized.slice(0, 160) : undefined;
}

function paymentResponseFields(header: string | null): Partial<PaymentFailureDiagnostic> {
  if (!header || Buffer.byteLength(header) > MAX_HEADER_BYTES) return {};
  try {
    const bytes = Buffer.from(header, "base64");
    if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== header.replace(/=+$/, "")) return {};
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const value = parsed as Record<string, unknown>;
    const paymentError = safeServerError(value.errorReason ?? value.error_reason ?? value.error);
    const paymentTransaction = safeServerError(value.transaction);
    const paymentNetwork = safeServerError(value.network);
    return {
      paymentResponseSha256: `0x${createHash("sha256").update(bytes).digest("hex")}`,
      ...(typeof value.success === "boolean" ? { paymentSuccess: value.success } : {}),
      ...(paymentError ? { paymentError } : {}),
      ...(paymentTransaction ? { paymentTransaction } : {}),
      ...(paymentNetwork ? { paymentNetwork } : {}),
    };
  } catch {
    return {};
  }
}

async function diagnosePaymentFailure(response: Response): Promise<PaymentFailureDiagnostic> {
  const paymentResponsePresent = response.headers.has("payment-response");
  const responseFields = paymentResponseFields(response.headers.get("payment-response"));
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_PAYMENT_FAILURE_BYTES) {
    return Object.freeze({ bodyStatus: "OVERSIZED", paymentResponsePresent, ...responseFields });
  }
  if (!response.body) return Object.freeze({ bodyStatus: "EMPTY", paymentResponsePresent, ...responseFields });

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAYMENT_FAILURE_BYTES) {
        await reader.cancel();
        return Object.freeze({ bodyStatus: "OVERSIZED", paymentResponsePresent, ...responseFields });
      }
      chunks.push(value);
    }
  } catch {
    return Object.freeze({ bodyStatus: "READ_FAILED", paymentResponsePresent, ...responseFields });
  } finally {
    reader.releaseLock();
  }
  if (size === 0) return Object.freeze({ bodyStatus: "EMPTY", paymentResponsePresent, ...responseFields });

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let serverError: string | undefined;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = parsed as Record<string, unknown>;
      serverError = safeServerError(
        value.error_code ?? value.errorCode ?? value.error_reason ?? value.errorReason ?? value.error ?? value.code,
      );
    }
  } catch {
    // A digest is enough for diagnostics; arbitrary upstream content is never persisted.
  }
  return Object.freeze({
    bodyStatus: "CAPTURED",
    bodyBytes: size,
    bodySha256: `0x${createHash("sha256").update(bytes).digest("hex")}`,
    ...(serverError ? { serverError } : {}),
    paymentResponsePresent,
    ...responseFields,
  });
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TelegraphEngineError("INVALID_RESPONSE", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TelegraphEngineError("INVALID_RESPONSE", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TelegraphEngineError("INVALID_RESPONSE", `${field} must be a non-negative finite number`);
  }
  return value;
}

function requireJsonValue(value: unknown, field: string): JsonValue {
  try {
    canonicalJson(value);
    return value as JsonValue;
  } catch {
    throw new TelegraphEngineError("INVALID_RESPONSE", `${field} must be deterministic JSON`);
  }
}

async function readBounded(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    throw new TelegraphEngineError("INVALID_RESPONSE", "Engine response exceeded 1 MiB");
  }
  if (!response.body) throw new TelegraphEngineError("INVALID_RESPONSE", "Engine response had no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TelegraphEngineError("INVALID_RESPONSE", "Engine response exceeded 1 MiB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parsePaymentReceipt(header: string | null): TelegraphPaymentReceipt | undefined {
  if (!header || Buffer.byteLength(header) > MAX_HEADER_BYTES) return undefined;
  try {
    const bytes = Buffer.from(header, "base64");
    if (bytes.length === 0 || bytes.toString("base64").replace(/=+$/, "") !== header.replace(/=+$/, "")) return undefined;
    const value = requireRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown, "payment response");
    return Object.freeze({
      headerHash: `0x${createHash("sha256").update(bytes).digest("hex")}`,
      ...(typeof value.success === "boolean" ? { success: value.success } : {}),
      ...(typeof value.transaction === "string" && value.transaction.trim() ? { transaction: value.transaction.trim() } : {}),
      ...(typeof value.network === "string" && value.network.trim() ? { network: value.network.trim() } : {}),
    });
  } catch {
    return undefined;
  }
}

export function createTelegraphEngineClient(options: {
  readonly nodeUrl: string;
  readonly maxCostUsdc: number;
  readonly fetchImpl?: typeof fetch;
}) {
  const nodeUrl = new URL(options.nodeUrl);
  if (nodeUrl.protocol !== "https:") throw new TypeError("nodeUrl must use HTTPS");
  nodeUrl.username = "";
  nodeUrl.password = "";
  if (!Number.isFinite(options.maxCostUsdc) || options.maxCostUsdc <= 0 || options.maxCostUsdc > 1) {
    throw new TypeError("maxCostUsdc must be greater than 0 and at most 1");
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return Object.freeze({
    async ask(
      input: { readonly query: string; readonly context: JsonValue },
      expectedIntent: TelegraphIntent,
      signal: AbortSignal,
    ): Promise<TelegraphEngineResult> {
      if (typeof input.query !== "string" || input.query.trim() === "") throw new TypeError("query must be non-empty");
      if (!INTENT_LABEL.test(expectedIntent)) throw new TypeError("expectedIntent must be a valid Intent label");
      const body = canonicalJson({ context: input.context, query: input.query.trim() });
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new TypeError("Engine request exceeds 64 KiB");

      let response: Response;
      try {
        response = await fetchImpl(new URL("/engine/v1/ask", nodeUrl), {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json" },
          body,
          signal,
        });
      } catch {
        throw new TelegraphEngineError("TRANSPORT_ERROR", "Telegraph Engine request failed");
      }

      if (response.status === 402) {
        const challenge = response.headers.get("payment-required");
        if (!challenge || Buffer.byteLength(challenge) > MAX_HEADER_BYTES) {
          const diagnostic = await diagnosePaymentFailure(response);
          throw new TelegraphEngineError(
            "INVALID_RESPONSE",
            "Engine payment challenge was missing or oversized",
            undefined,
            diagnostic,
          );
        }
        throw new TelegraphEngineError("PAYMENT_REQUIRED", "Telegraph Engine requires x402 payment", challenge);
      }
      if (!response.ok) {
        const diagnostic = await diagnosePaymentFailure(response);
        throw new TelegraphEngineError("HTTP_ERROR", `Telegraph Engine returned HTTP ${response.status}`, undefined, diagnostic);
      }

      const bytes = await readBounded(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } catch {
        throw new TelegraphEngineError("INVALID_RESPONSE", "Engine response was not valid UTF-8 JSON");
      }
      const value = requireRecord(parsed, "Engine response");
      const costUsd = requireNonNegativeNumber(value.cost_usd, "cost_usd");
      if (costUsd > options.maxCostUsdc) throw new TelegraphEngineError("COST_EXCEEDED", "Settled cost exceeded the configured maximum");
      const intent = requireString(value.intent, "intent").toUpperCase();
      if (intent !== expectedIntent) {
        throw new TelegraphEngineError("INVALID_RESPONSE", `Engine routed the request to unexpected Intent ${intent}`);
      }
      const signalHash = requireString(value.signal_hash, "signal_hash").toLowerCase();
      if (!SIGNAL_HASH.test(signalHash)) throw new TelegraphEngineError("INVALID_RESPONSE", "signal_hash must be a 32-byte hex value");
      const timestamp = requireString(value.timestamp, "timestamp");
      if (Number.isNaN(Date.parse(timestamp))) throw new TelegraphEngineError("INVALID_RESPONSE", "timestamp must be a valid date-time");
      const minerId = typeof value.miner_id === "number" && Number.isSafeInteger(value.miner_id)
        ? String(value.miner_id)
        : requireString(value.miner_id, "miner_id");
      const warnings = value.warnings === undefined ? [] : value.warnings;
      if (!Array.isArray(warnings) || !warnings.every((warning) => typeof warning === "string")) {
        throw new TelegraphEngineError("INVALID_RESPONSE", "warnings must be strings");
      }
      const paymentReceipt = parsePaymentReceipt(response.headers.get("payment-response"));
      return Object.freeze({
        minerId,
        minerName: requireString(value.miner_name, "miner_name"),
        endpoint: requireString(value.endpoint, "endpoint"),
        result: requireJsonValue(value.result, "result"),
        costUsd,
        durationMs: requireNonNegativeNumber(value.duration_ms, "duration_ms"),
        timestamp: new Date(timestamp).toISOString(),
        intent: expectedIntent,
        signalHash: signalHash as `0x${string}`,
        rawResponseHash: `0x${createHash("sha256").update(bytes).digest("hex")}`,
        ...(paymentReceipt ? { paymentReceipt } : {}),
        warnings: Object.freeze(warnings.map((warning) => warning.trim()).filter(Boolean)),
      });
    },
  });
}

export function createFraudEngineClient(options: Parameters<typeof createTelegraphEngineClient>[0]) {
  const engine = createTelegraphEngineClient(options);
  return Object.freeze({
    askFraud: (input: { readonly query: string; readonly context: JsonValue }, signal: AbortSignal) =>
      engine.ask(input, "FRAUD_DETECTION", signal),
  });
}
