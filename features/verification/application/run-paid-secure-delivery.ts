import { randomUUID } from "node:crypto";
import type { SecureDeliveryFraudInput, FraudVerificationRecord } from "./fraud-verification";
import type { StrictVerificationRecord } from "./secure-delivery-intents";
import type { GenericPolicyVerificationRecord } from "./policy-verification";
import type { VerificationAttemptEvent, VerificationAttemptStore } from "./verification-attempt-store";
import type { VerificationSignal } from "../domain/verification";
import { TelegraphEngineError, type TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import type { AuthorizedPayment } from "@/infrastructure/x402/authorized-fetch";

export type SecureDeliveryVerificationRecord = FraudVerificationRecord | StrictVerificationRecord | GenericPolicyVerificationRecord;
type Reconciliation = Readonly<{ state: "EXPIRED_UNSETTLED" | "SETTLED" | "UNKNOWN"; evidence: Readonly<Record<string, string | number | boolean>> }>;

export type PaidSecureDeliveryResult = Readonly<{
  runId: string;
  records: readonly SecureDeliveryVerificationRecord[];
  signals: readonly VerificationSignal[];
  attempts: number;
  authorizedCostUsdc: number;
  settledCostUsdc: number;
  complete: boolean;
  haltedAfterAmbiguousPayment: boolean;
}>;

function microUsdc(value: number): bigint {
  const units = value * 1_000_000;
  if (!Number.isSafeInteger(units) || units <= 0) throw new TypeError("USDC amount must be positive with at most six decimals");
  return BigInt(units);
}

function routeIdentity(record: SecureDeliveryVerificationRecord): string {
  const id = record.minerId.trim().toLowerCase();
  if (!id) throw new TypeError("Miner identity is required");
  return id;
}

function isConclusive(record: SecureDeliveryVerificationRecord): boolean {
  return record.verdict !== "INCONCLUSIVE" && record.confidence >= 0.75;
}

export async function runPaidSecureDelivery(options: Readonly<{
  runId?: string;
  input: Pick<SecureDeliveryFraudInput, "pactId">;
  intents: readonly TelegraphIntent[];
  maxAttemptsPerIntent: number;
  maxAuthorizedCostUsdc: number;
  attemptStore: VerificationAttemptStore;
  authorizePayment(payment: AuthorizedPayment, context: Readonly<{ intent: TelegraphIntent; attemptNumber: number; cumulativeAuthorizedCostUsdc: number }>): boolean | Promise<boolean>;
  reconcileAuthorizedFailure?: (context: Readonly<{ payment: AuthorizedPayment; attemptNumber: number; authorizedAt: string; error: unknown }>) => Promise<Reconciliation>;
  attempt(intent: TelegraphIntent, attemptNumber: number, authorizePayment: (payment: AuthorizedPayment) => Promise<boolean>): Promise<SecureDeliveryVerificationRecord>;
  sleep?: (milliseconds: number) => Promise<void>;
}>): Promise<PaidSecureDeliveryResult> {
  if (!Number.isSafeInteger(options.maxAttemptsPerIntent) || options.maxAttemptsPerIntent < 1 || options.maxAttemptsPerIntent > 3) {
    throw new TypeError("maxAttemptsPerIntent must be between 1 and 3");
  }
  if (options.intents.length < 3 || options.intents.length > 4 || new Set(options.intents).size !== options.intents.length) {
    throw new TypeError("A policy verification requires three or four distinct intents");
  }
  const maximumUnits = microUsdc(options.maxAuthorizedCostUsdc);
  const runId = options.runId ?? randomUUID();
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const records: SecureDeliveryVerificationRecord[] = [];
  const seenMinersByIntent = new Map<TelegraphIntent, Set<string>>();
  let authorizedUnits = 0n;
  let settledUnits = 0n;
  let totalAttempts = 0;
  let haltedAfterAmbiguousPayment = false;

  intentLoop: for (const intent of options.intents) {
    const seenMiners = seenMinersByIntent.get(intent) ?? new Set<string>();
    seenMinersByIntent.set(intent, seenMiners);
    for (let attemptNumber = 1; attemptNumber <= options.maxAttemptsPerIntent; attemptNumber += 1) {
      totalAttempts += 1;
      const routeRunId = `${runId}:${intent}`;
      let authorizedPayment: AuthorizedPayment | undefined;
      let authorizedAt: string | undefined;
      await options.attemptStore.append({ eventId: randomUUID(), runId: routeRunId, pactId: options.input.pactId, intent, attemptNumber, occurredAt: new Date().toISOString(), type: "STARTED" });
      const authorize = async (payment: AuthorizedPayment) => {
        if (authorizedPayment) return false;
        const units = microUsdc(payment.amountUsdc);
        if (authorizedUnits + units > maximumUnits) return false;
        const cumulative = Number(authorizedUnits + units) / 1_000_000;
        if (!await options.authorizePayment(payment, { intent, attemptNumber, cumulativeAuthorizedCostUsdc: cumulative })) return false;
        authorizedAt = new Date().toISOString();
        await options.attemptStore.append({
          eventId: randomUUID(), runId: routeRunId, pactId: options.input.pactId, intent, attemptNumber,
          occurredAt: authorizedAt, type: "PAYMENT_AUTHORIZED", payment, cumulativeAuthorizedCostUsdc: cumulative,
        });
        authorizedPayment = payment;
        authorizedUnits += units;
        return true;
      };
      try {
        const record = await options.attempt(intent, attemptNumber, authorize);
        settledUnits += BigInt(Math.round(record.costUsd * 1_000_000));
        const identity = routeIdentity(record);
        const event = {
          eventId: randomUUID(), runId: routeRunId, pactId: options.input.pactId, intent, attemptNumber,
          occurredAt: new Date().toISOString(), minerId: record.minerId, minerName: record.minerName,
          signalHash: record.signalHash, rawResponseHash: record.rawResponseHash, settledCostUsdc: record.costUsd,
          ...(record.paymentReference ? { paymentReference: record.paymentReference } : {}),
        } as const;
        if (seenMiners.has(identity)) {
          await options.attemptStore.append({ ...event, type: "DUPLICATE", duplicateIdentity: identity });
          // A repeated Miner is not a second independent result, but it may be a
          // newer observation for an asynchronous check (for example SSL Labs).
          // Replace that Miner's earlier observation only when the retry becomes
          // conclusive; the DUPLICATE event preserves the full audit trail.
          const priorIndex = records.findIndex((candidate) => candidate.intent === intent
            && routeIdentity(candidate) === identity);
          if (priorIndex >= 0 && isConclusive(record) && !isConclusive(records[priorIndex]!)) {
            records[priorIndex] = record;
            break;
          }
          if (attemptNumber < options.maxAttemptsPerIntent) {
            await sleep(attemptNumber === 1 ? 15_000 : 30_000);
            continue;
          }
        } else {
          seenMiners.add(identity);
          records.push(record);
          await options.attemptStore.append({ ...event, type: "SUCCEEDED" });
          const needsIndependentRetry = !isConclusive(record);
          if (!needsIndependentRetry || attemptNumber === options.maxAttemptsPerIntent) break;
          await sleep(attemptNumber === 1 ? 15_000 : 30_000);
          continue;
        }
      } catch (error) {
        const engineError = error instanceof TelegraphEngineError ? error : undefined;
        const authorized = Boolean(authorizedPayment);
        const explicitlyUnsettled = authorized && engineError?.paymentFailure?.paymentSuccess === false;
        const paymentState = !authorized ? "NOT_AUTHORIZED" : explicitlyUnsettled ? "EXPLICITLY_UNSETTLED" : "AUTHORIZED_AMBIGUOUS";
        const retryable = !authorized
          ? engineError?.code === "HTTP_ERROR" || engineError?.code === "TRANSPORT_ERROR"
          : explicitlyUnsettled;
        await options.attemptStore.append({
          eventId: randomUUID(), runId: routeRunId, pactId: options.input.pactId, intent, attemptNumber,
          occurredAt: new Date().toISOString(), type: "FAILED", errorCode: engineError?.code ?? "UNCLASSIFIED", paymentState, retryable,
          ...(engineError ? { diagnostic: { message: engineError.message.slice(0, 200) } } : {}),
        });
        if (paymentState === "AUTHORIZED_AMBIGUOUS") {
          if (!authorizedPayment || !authorizedAt || !options.reconcileAuthorizedFailure) throw error;
          const reconciliation = await options.reconcileAuthorizedFailure({ payment: authorizedPayment, attemptNumber, authorizedAt, error });
          const retryPermitted = reconciliation.state === "EXPIRED_UNSETTLED" && attemptNumber < options.maxAttemptsPerIntent;
          await options.attemptStore.append({
            eventId: randomUUID(), runId: routeRunId, pactId: options.input.pactId, intent, attemptNumber,
            occurredAt: new Date().toISOString(), type: "PAYMENT_RECONCILED", reconciliationState: reconciliation.state,
            retryPermitted, evidence: reconciliation.evidence,
          });
          if (!retryPermitted) {
            if (reconciliation.state === "SETTLED") {
              settledUnits += microUsdc(authorizedPayment.amountUsdc);
            }
            haltedAfterAmbiguousPayment = true;
            break intentLoop;
          }
        } else if (!retryable || attemptNumber === options.maxAttemptsPerIntent) {
          break;
        }
        await sleep(attemptNumber === 1 ? 10_000 : 30_000);
      }
    }
  }

  const signals: VerificationSignal[] = records.map((record) => ({
    intent: record.intent,
    minerId: record.minerId,
    signalHash: record.signalHash,
    verdict: record.verdict,
    confidence: record.confidence,
    observedAt: record.observedAt,
  }));
  return Object.freeze({
    runId, records: Object.freeze(records), signals: Object.freeze(signals), attempts: totalAttempts,
    authorizedCostUsdc: Number(authorizedUnits) / 1_000_000,
    settledCostUsdc: Number(settledUnits) / 1_000_000,
    complete: new Set(records.map((record) => record.intent)).size === options.intents.length,
    haltedAfterAmbiguousPayment,
  });
}
