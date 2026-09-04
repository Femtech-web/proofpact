import "server-only";

import type { VerificationIntent, VerificationSignal } from "@/features/verification/domain/verification";

export type TelegraphVerificationRequest = Readonly<{
  jobId: string;
  intent: VerificationIntent;
  question: string;
  maximumPriceUsdc: number;
}>;

/**
 * Infrastructure boundary for the ProofRoute-derived x402 client.
 * The concrete paid-routing adapter will retain bounded retries, payment caps,
 * Miner identity capture, and signal-hash validation behind this interface.
 */
export interface TelegraphVerifier {
  verify(request: TelegraphVerificationRequest): Promise<VerificationSignal>;
}
