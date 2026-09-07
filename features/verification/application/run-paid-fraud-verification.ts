import { randomUUID } from "node:crypto";
import type { FraudVerificationRecord, SecureDeliveryFraudInput } from "./fraud-verification";
import type { VerificationAttemptEvent, VerificationAttemptStore } from "./verification-attempt-store";
import { TelegraphEngineError } from "@/infrastructure/telegraph/engine-client";
import type { AuthorizedPayment } from "@/infrastructure/x402/authorized-fetch";

const MAX_SAFE_ATTEMPTS = 3;
const RETRYABLE_UNSETTLED_PAYMENT_ERRORS = new Set(["invalid_exact_evm_transaction_failed"]);

export type PaidFraudAttempt = Readonly<{
  attemptNumber: number;
  authorizePayment: (payment: AuthorizedPayment) => Promise<boolean>;
}>;

export type PaidFraudRunResult = Readonly<{
  runId: string;
  records: readonly FraudVerificationRecord[];
  attempts: number;
  authorizedCostUsdc: number;
  settledCostUsdc: number;
  complete: boolean;
}>;

export type PaidFraudRunOptions = Readonly<{
  runId?: string;
  input: SecureDeliveryFraudInput;
  maxAttempts: number;
  requiredDistinctResults: number;
  maxAuthorizedCostUsdc: number;
  attemptStore: VerificationAttemptStore;
  authorizePayment: (payment: AuthorizedPayment, attemptNumber: number) => boolean | Promise<boolean>;
  reconcileAuthorizedFailure?: (context: Readonly<{
    payment: AuthorizedPayment;
    attemptNumber: number;
    authorizedAt: string;
    error: unknown;
  }>) => Promise<Readonly<{
    state: "EXPIRED_UNSETTLED" | "SETTLED" | "UNKNOWN";
    evidence: Readonly<Record<string, string | number | boolean>>;
  }>>;
  retryDelayMs?: (context: Readonly<{
    attemptNumber: number;
    errorCode: string;
    paymentState: "NOT_AUTHORIZED" | "EXPLICITLY_UNSETTLED";
  }>) => number;
  sleep?: (milliseconds: number) => Promise<void>;
  attempt: (context: PaidFraudAttempt) => Promise<FraudVerificationRecord>;
  now?: () => Date;
  createEventId?: () => string;
}>;

type AttemptEventDetails = VerificationAttemptEvent extends infer Event
  ? Event extends VerificationAttemptEvent
    ? Omit<Event, "eventId" | "runId" | "pactId" | "intent" | "attemptNumber" | "occurredAt">
    : never
  : never;

function toMicroUsdc(value: number, field: string, allowZero = false): bigint {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0) || value > 1) {
    throw new TypeError(`${field} must be ${allowZero ? "at least 0" : "greater than 0"} and at most 1`);
  }
  const units = value * 1_000_000;
  if (!Number.isSafeInteger(units)) throw new TypeError(`${field} must have at most six decimal places`);
  return BigInt(units);
}

function identity(record: FraudVerificationRecord): string {
  const minerId = record.minerId.trim().toLowerCase();
  const minerName = record.minerName.trim().toLowerCase();
  if (!minerId || !minerName) throw new TypeError("Miner identity must include an id and name");
  return `${minerId}:${minerName}`;
}

function safeDiagnostic(error: TelegraphEngineError): Readonly<Record<string, string | number | boolean>> | undefined {
  const failure = error.paymentFailure;
  if (!failure) return undefined;
  return Object.freeze({
    bodyStatus: failure.bodyStatus,
    paymentResponsePresent: failure.paymentResponsePresent,
    ...(failure.bodyBytes === undefined ? {} : { bodyBytes: failure.bodyBytes }),
    ...(failure.bodySha256 ? { bodySha256: failure.bodySha256 } : {}),
    ...(failure.serverError ? { serverError: failure.serverError } : {}),
    ...(failure.paymentResponseSha256 ? { paymentResponseSha256: failure.paymentResponseSha256 } : {}),
    ...(failure.paymentSuccess === undefined ? {} : { paymentSuccess: failure.paymentSuccess }),
    ...(failure.paymentError ? { paymentError: failure.paymentError } : {}),
    ...(failure.paymentTransaction ? { paymentTransaction: failure.paymentTransaction } : {}),
    ...(failure.paymentNetwork ? { paymentNetwork: failure.paymentNetwork } : {}),
  });
}

function classifyFailure(error: unknown, authorized: boolean): {
  readonly errorCode: string;
  readonly paymentState: "NOT_AUTHORIZED" | "EXPLICITLY_UNSETTLED" | "AUTHORIZED_AMBIGUOUS";
  readonly retryable: boolean;
  readonly diagnostic?: Readonly<Record<string, string | number | boolean>>;
} {
  if (!(error instanceof TelegraphEngineError)) {
    return { errorCode: "UNCLASSIFIED", paymentState: authorized ? "AUTHORIZED_AMBIGUOUS" : "NOT_AUTHORIZED", retryable: false };
  }
  const explicitlyUnsettled = authorized
    && error.paymentFailure?.paymentSuccess === false
    && typeof error.paymentFailure.paymentError === "string"
    && RETRYABLE_UNSETTLED_PAYMENT_ERRORS.has(error.paymentFailure.paymentError);
  return {
    errorCode: error.code,
    paymentState: !authorized ? "NOT_AUTHORIZED" : explicitlyUnsettled ? "EXPLICITLY_UNSETTLED" : "AUTHORIZED_AMBIGUOUS",
    retryable: !authorized
      ? error.code === "HTTP_ERROR" || error.code === "TRANSPORT_ERROR"
      : explicitlyUnsettled,
    ...(safeDiagnostic(error) ? { diagnostic: safeDiagnostic(error) } : {}),
  };
}

export async function runPaidFraudVerification(options: PaidFraudRunOptions): Promise<PaidFraudRunResult> {
  if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > MAX_SAFE_ATTEMPTS) {
    throw new TypeError(`maxAttempts must be between 1 and ${MAX_SAFE_ATTEMPTS}`);
  }
  if (!Number.isSafeInteger(options.requiredDistinctResults)
    || options.requiredDistinctResults < 1
    || options.requiredDistinctResults > options.maxAttempts) {
    throw new TypeError("requiredDistinctResults must be between 1 and maxAttempts");
  }
  const maxAuthorizedUnits = toMicroUsdc(options.maxAuthorizedCostUsdc, "maxAuthorizedCostUsdc");
  const pactId = options.input.pactId.trim();
  if (!pactId || pactId.length > 128) throw new TypeError("input.pactId is required and must be at most 128 characters");
  const runId = options.runId === undefined ? randomUUID() : options.runId.trim();
  if (!runId || runId.length > 128) throw new TypeError("runId is required and must be at most 128 characters");
  const now = options.now ?? (() => new Date());
  const createEventId = options.createEventId ?? randomUUID;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const records: FraudVerificationRecord[] = [];
  const seenIdentities = new Set<string>();
  let authorizedUnits = 0n;
  let settledUnits = 0n;
  let attempts = 0;

  const append = (attemptNumber: number, event: AttemptEventDetails) => options.attemptStore.append({
    eventId: createEventId(),
    runId,
    pactId,
    intent: "FRAUD_DETECTION",
    attemptNumber,
    occurredAt: now().toISOString(),
    ...event,
  } as VerificationAttemptEvent);

  for (let attemptNumber = 1; attemptNumber <= options.maxAttempts; attemptNumber += 1) {
    attempts = attemptNumber;
    let authorizedThisAttempt = false;
    let authorizedPayment: AuthorizedPayment | undefined;
    let authorizedAt: string | undefined;
    await append(attemptNumber, { type: "STARTED" });

    const authorizePayment = async (payment: AuthorizedPayment): Promise<boolean> => {
      if (authorizedThisAttempt) return false;
      let paymentUnits: bigint;
      try {
        paymentUnits = toMicroUsdc(payment.amountUsdc, "payment.amountUsdc");
      } catch {
        return false;
      }
      if (authorizedUnits + paymentUnits > maxAuthorizedUnits) return false;
      if (!await options.authorizePayment(payment, attemptNumber)) return false;

      // Persist authority before returning it to the signing boundary.
      authorizedAt = now().toISOString();
      await options.attemptStore.append({
        eventId: createEventId(),
        runId,
        pactId,
        intent: "FRAUD_DETECTION",
        attemptNumber,
        occurredAt: authorizedAt,
        type: "PAYMENT_AUTHORIZED",
        payment,
        cumulativeAuthorizedCostUsdc: Number(authorizedUnits + paymentUnits) / 1_000_000,
      });
      authorizedThisAttempt = true;
      authorizedPayment = payment;
      authorizedUnits += paymentUnits;
      return true;
    };

    try {
      const record = await options.attempt(Object.freeze({ attemptNumber, authorizePayment }));
      const settled = toMicroUsdc(record.costUsd, "record.costUsd", true);
      settledUnits += settled;
      const routeIdentity = identity(record);
      const common = {
        minerId: record.minerId,
        minerName: record.minerName,
        signalHash: record.signalHash,
        rawResponseHash: record.rawResponseHash,
        settledCostUsdc: record.costUsd,
        ...(record.paymentReference ? { paymentReference: record.paymentReference } : {}),
      };
      if (seenIdentities.has(routeIdentity)) {
        await append(attemptNumber, { type: "DUPLICATE", duplicateIdentity: routeIdentity, ...common });
      } else {
        seenIdentities.add(routeIdentity);
        records.push(record);
        await append(attemptNumber, { type: "SUCCEEDED", ...common });
      }
      if (records.length >= options.requiredDistinctResults) {
        return Object.freeze({
          runId,
          records: Object.freeze([...records]),
          attempts,
          authorizedCostUsdc: Number(authorizedUnits) / 1_000_000,
          settledCostUsdc: Number(settledUnits) / 1_000_000,
          complete: true,
        });
      }
    } catch (error) {
      const failure = classifyFailure(error, authorizedThisAttempt);
      await append(attemptNumber, { type: "FAILED", ...failure });
      if (failure.paymentState === "AUTHORIZED_AMBIGUOUS"
        && authorizedPayment
        && authorizedAt
        && options.reconcileAuthorizedFailure) {
        let reconciliation: Awaited<ReturnType<NonNullable<PaidFraudRunOptions["reconcileAuthorizedFailure"]>>>;
        try {
          reconciliation = await options.reconcileAuthorizedFailure({
            payment: authorizedPayment,
            attemptNumber,
            authorizedAt,
            error,
          });
        } catch {
          reconciliation = {
            state: "UNKNOWN",
            evidence: Object.freeze({ reason: "RECONCILIATION_FAILED" }),
          };
        }
        const retryPermitted = reconciliation.state === "EXPIRED_UNSETTLED"
          && attemptNumber < options.maxAttempts;
        await append(attemptNumber, {
          type: "PAYMENT_RECONCILED",
          reconciliationState: reconciliation.state,
          retryPermitted,
          evidence: reconciliation.evidence,
        });
        if (retryPermitted) continue;
      }
      if (!failure.retryable) throw error;
      if (attemptNumber === options.maxAttempts && records.length === 0) throw error;
      const delayMs = options.retryDelayMs?.({
        attemptNumber,
        errorCode: failure.errorCode,
        paymentState: failure.paymentState as "NOT_AUTHORIZED" | "EXPLICITLY_UNSETTLED",
      }) ?? 0;
      if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
        throw new TypeError("retry delay must be an integer between 0 and 60000 milliseconds");
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  return Object.freeze({
    runId,
    records: Object.freeze([...records]),
    attempts,
    authorizedCostUsdc: Number(authorizedUnits) / 1_000_000,
    settledCostUsdc: Number(settledUnits) / 1_000_000,
    complete: false,
  });
}
