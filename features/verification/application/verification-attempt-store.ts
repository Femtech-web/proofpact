import type { TelegraphIntent } from "@/infrastructure/telegraph/engine-client";
import type { AuthorizedPayment } from "@/infrastructure/x402/authorized-fetch";

type AttemptEventBase = Readonly<{
  eventId: string;
  runId: string;
  pactId: string;
  intent: TelegraphIntent;
  attemptNumber: number;
  occurredAt: string;
}>;

export type VerificationAttemptEvent =
  | (AttemptEventBase & Readonly<{ type: "STARTED" }>)
  | (AttemptEventBase & Readonly<{
      type: "PAYMENT_AUTHORIZED";
      payment: AuthorizedPayment;
      cumulativeAuthorizedCostUsdc: number;
    }>)
  | (AttemptEventBase & Readonly<{
      type: "SUCCEEDED";
      minerId: string;
      minerName: string;
      signalHash: `0x${string}`;
      rawResponseHash: `0x${string}`;
      settledCostUsdc: number;
      paymentReference?: string;
    }>)
  | (AttemptEventBase & Readonly<{
      type: "DUPLICATE";
      minerId: string;
      minerName: string;
      duplicateIdentity: string;
      signalHash: `0x${string}`;
      rawResponseHash: `0x${string}`;
      settledCostUsdc: number;
      paymentReference?: string;
    }>)
  | (AttemptEventBase & Readonly<{
      type: "FAILED";
      errorCode: string;
      paymentState: "NOT_AUTHORIZED" | "EXPLICITLY_UNSETTLED" | "AUTHORIZED_AMBIGUOUS";
      retryable: boolean;
      diagnostic?: Readonly<Record<string, string | number | boolean>>;
    }>);

export interface VerificationAttemptStore {
  append(event: VerificationAttemptEvent): Promise<void>;
}

export function createInMemoryVerificationAttemptStore(): VerificationAttemptStore & {
  readonly events: VerificationAttemptEvent[];
} {
  const events: VerificationAttemptEvent[] = [];
  return {
    events,
    async append(event) {
      events.push(Object.freeze({ ...event }) as VerificationAttemptEvent);
    },
  };
}
