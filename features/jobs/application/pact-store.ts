import type { PolicyPackId } from "@/features/policies/domain/policy-pack";
import type { SettlementDecision } from "@/features/settlement/domain/evaluate-settlement";
import type { VerificationSignal } from "@/features/verification/domain/verification";
import type { JsonValue } from "@/shared/json/canonical-json";

export type PactStatus = "DRAFT" | "FUNDED" | "SUBMITTED" | "VERIFYING" | "HELD" | "APPROVED" | "RELEASED" | "REJECTED";

export type Pact = Readonly<{
  id: string;
  requesterAddress: `0x${string}`;
  workerAddress: `0x${string}`;
  policyPackId: PolicyPackId;
  policyVersion: string;
  title: string;
  acceptanceCriteria: string;
  rewardUsdc: string;
  chainId: number;
  escrowAddress?: `0x${string}`;
  fundingTransactionHash?: `0x${string}`;
  onchainPactId?: `0x${string}`;
  termsHash?: `0x${string}`;
  refundAfter?: string;
  status: PactStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type Submission = Readonly<{
  id: string;
  pactId: string;
  sequence: number;
  submittedBy: `0x${string}`;
  artifactHash: `0x${string}`;
  evidence: JsonValue;
  claimedRemediation: string;
  createdAt: string;
}>;

export type PersistedDecision = Readonly<{
  id: string;
  runId: string;
  decision: SettlementDecision;
  reason: string;
  missingIntents: readonly string[];
  policyVersion: string;
  decidedAt: string;
}>;

export type Receipt = Readonly<{
  id: string;
  pactId: string;
  submissionId: string;
  runId: string;
  receiptHash: `0x${string}`;
  artifactHash: `0x${string}`;
  decision: SettlementDecision;
  payload: JsonValue;
  settlementTransactionHash?: `0x${string}`;
  createdAt: string;
}>;

export type ChangeRequest = Readonly<{
  id: string;
  pactId: string;
  submissionId: string;
  requestedBy: `0x${string}`;
  feedback: string;
  createdAt: string;
}>;

export type CreateChangeRequestInput = Readonly<{
  pactId: string;
  submissionId: string;
  requestedBy: `0x${string}`;
  feedback: string;
  idempotencyKey: string;
}>;

export type CreatePactInput = Omit<Pact, "id" | "status" | "createdAt" | "updatedAt"> & Readonly<{
  idempotencyKey: string;
}>;

export type CreateSubmissionInput = Omit<Submission, "id" | "sequence" | "createdAt"> & Readonly<{
  idempotencyKey: string;
}>;

export type ConfirmFundingInput = Readonly<{
  pactId: string;
  escrowAddress: `0x${string}`;
  fundingTransactionHash: `0x${string}`;
  onchainPactId: `0x${string}`;
  termsHash: `0x${string}`;
  refundAfter: string;
}>;

export type CompleteVerificationInput = Readonly<{
  pactId: string;
  submissionId: string;
  runId: string;
  signals: readonly VerificationSignal[];
  decision: Omit<PersistedDecision, "id" | "runId">;
  receipt: Omit<Receipt, "id" | "pactId" | "submissionId" | "runId" | "createdAt">;
  idempotencyKey: string;
}>;

export interface PactStore {
  createPact(input: CreatePactInput): Promise<Pact>;
  getPact(id: string): Promise<Pact | undefined>;
  listPacts(limit?: number): Promise<readonly Pact[]>;
  confirmFunding(input: ConfirmFundingInput): Promise<Pact>;
  createSubmission(input: CreateSubmissionInput): Promise<Submission>;
  getLatestSubmission(pactId: string): Promise<Submission | undefined>;
  beginVerification(pactId: string, submissionId: string): Promise<Pact>;
  completeVerification(input: CompleteVerificationInput): Promise<Receipt>;
  getReceipt(id: string): Promise<Receipt | undefined>;
  listReceipts(limit?: number): Promise<readonly Receipt[]>;
  getLatestReceiptForPact(pactId: string): Promise<Receipt | undefined>;
  createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest>;
  getLatestChangeRequest(pactId: string): Promise<ChangeRequest | undefined>;
}
