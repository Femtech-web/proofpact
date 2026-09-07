import "server-only";

import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import type {
  CompleteVerificationInput,
  CreatePactInput,
  ConfirmFundingInput,
  CreateSubmissionInput,
  Pact,
  PactStatus,
  PactStore,
  Receipt,
  Submission,
  ChangeRequest,
  CreateChangeRequestInput,
} from "@/features/jobs/application/pact-store";
import type { PolicyPackId } from "@/features/policies/domain/policy-pack";

type PactRow = Readonly<{
  pact_id: string;
  requester_address: `0x${string}`;
  worker_address: `0x${string}`;
  policy_pack_id: PolicyPackId;
  policy_version: string;
  title: string;
  acceptance_criteria: string;
  reward_usdc: string;
  chain_id: string;
  escrow_address: `0x${string}` | null;
  funding_transaction_hash: `0x${string}` | null;
  onchain_pact_id: `0x${string}` | null;
  terms_hash: `0x${string}` | null;
  refund_after: Date | null;
  status: PactStatus;
  created_at: Date;
  updated_at: Date;
}>;

type SubmissionRow = Readonly<{
  submission_id: string;
  pact_id: string;
  sequence: number;
  submitted_by: `0x${string}`;
  artifact_hash: `0x${string}`;
  evidence: Submission["evidence"];
  claimed_remediation: string;
  created_at: Date;
}>;

type ReceiptRow = Readonly<{
  receipt_id: string;
  pact_id: string;
  submission_id: string;
  run_id: string;
  receipt_hash: `0x${string}`;
  artifact_hash: `0x${string}`;
  decision: Receipt["decision"];
  payload: Receipt["payload"];
  settlement_transaction_hash: `0x${string}` | null;
  created_at: Date;
}>;

type ChangeRequestRow = Readonly<{
  change_request_id: string;
  pact_id: string;
  submission_id: string;
  requested_by: `0x${string}`;
  feedback: string;
  created_at: Date;
}>;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const MONEY = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;

function key(value: string): string {
  const result = value.trim();
  if (result.length < 8 || result.length > 200) throw new TypeError("idempotencyKey must be 8-200 characters");
  return result;
}

function address(value: string, field: string): `0x${string}` {
  if (!ADDRESS.test(value)) throw new TypeError(`${field} must be an EVM address`);
  return value.toLowerCase() as `0x${string}`;
}

function hash(value: string, field: string): `0x${string}` {
  if (!HASH.test(value)) throw new TypeError(`${field} must be a 32-byte hash`);
  return value.toLowerCase() as `0x${string}`;
}

function money(value: string): string {
  if (!MONEY.test(value) || Number(value) <= 0) throw new TypeError("rewardUsdc must be a positive decimal with at most six places");
  return value;
}

function pact(row: PactRow): Pact {
  return Object.freeze({
    id: row.pact_id,
    requesterAddress: row.requester_address,
    workerAddress: row.worker_address,
    policyPackId: row.policy_pack_id,
    policyVersion: row.policy_version,
    title: row.title,
    acceptanceCriteria: row.acceptance_criteria,
    rewardUsdc: row.reward_usdc,
    chainId: Number(row.chain_id),
    ...(row.escrow_address ? { escrowAddress: row.escrow_address } : {}),
    ...(row.funding_transaction_hash ? { fundingTransactionHash: row.funding_transaction_hash } : {}),
    ...(row.onchain_pact_id ? { onchainPactId: row.onchain_pact_id } : {}),
    ...(row.terms_hash ? { termsHash: row.terms_hash } : {}),
    ...(row.refund_after ? { refundAfter: row.refund_after.toISOString() } : {}),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

function submission(row: SubmissionRow): Submission {
  return Object.freeze({
    id: row.submission_id,
    pactId: row.pact_id,
    sequence: row.sequence,
    submittedBy: row.submitted_by,
    artifactHash: row.artifact_hash,
    evidence: row.evidence,
    claimedRemediation: row.claimed_remediation,
    createdAt: row.created_at.toISOString(),
  });
}

function receipt(row: ReceiptRow): Receipt {
  return Object.freeze({
    id: row.receipt_id,
    pactId: row.pact_id,
    submissionId: row.submission_id,
    runId: row.run_id,
    receiptHash: row.receipt_hash,
    artifactHash: row.artifact_hash,
    decision: row.decision,
    payload: row.payload,
    ...(row.settlement_transaction_hash ? { settlementTransactionHash: row.settlement_transaction_hash } : {}),
    createdAt: row.created_at.toISOString(),
  });
}

function changeRequest(row: ChangeRequestRow): ChangeRequest {
  return Object.freeze({
    id: row.change_request_id,
    pactId: row.pact_id,
    submissionId: row.submission_id,
    requestedBy: row.requested_by,
    feedback: row.feedback,
    createdAt: row.created_at.toISOString(),
  });
}

function createStore(sql: Sql): PactStore & Readonly<{ close(): Promise<void> }> {
  return Object.freeze({
    async createPact(input: CreatePactInput): Promise<Pact> {
      const id = randomUUID();
      const rows = await sql<readonly PactRow[]>`
        INSERT INTO pacts (
          pact_id, idempotency_key, requester_address, worker_address, policy_pack_id,
          policy_version, title, acceptance_criteria, reward_usdc, chain_id,
          escrow_address, funding_transaction_hash, status
        ) VALUES (
          ${id}, ${key(input.idempotencyKey)}, ${address(input.requesterAddress, "requesterAddress")},
          ${address(input.workerAddress, "workerAddress")}, ${input.policyPackId}, ${input.policyVersion.trim()},
          ${input.title.trim()}, ${input.acceptanceCriteria.trim()}, ${money(input.rewardUsdc)}, ${input.chainId},
          ${input.escrowAddress ? address(input.escrowAddress, "escrowAddress") : null},
          ${input.fundingTransactionHash ? hash(input.fundingTransactionHash, "fundingTransactionHash") : null},
          ${input.fundingTransactionHash ? "FUNDED" : "DRAFT"}
        ) ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING *
      `;
      if (rows[0]) return pact(rows[0]);
      const existing = await sql<readonly PactRow[]>`SELECT * FROM pacts WHERE idempotency_key = ${key(input.idempotencyKey)}`;
      if (!existing[0]) throw new Error("Idempotent pact lookup failed");
      return pact(existing[0]);
    },

    async getPact(id: string): Promise<Pact | undefined> {
      const rows = await sql<readonly PactRow[]>`SELECT * FROM pacts WHERE pact_id = ${id}`;
      return rows[0] ? pact(rows[0]) : undefined;
    },

    async listPacts(limit = 20): Promise<readonly Pact[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("limit must be 1-100");
      const rows = await sql<readonly PactRow[]>`SELECT * FROM pacts ORDER BY created_at DESC LIMIT ${limit}`;
      return Object.freeze(rows.map(pact));
    },

    async confirmFunding(input: ConfirmFundingInput): Promise<Pact> {
      return sql.begin(async (tx) => {
        const rows = await tx<readonly PactRow[]>`
          SELECT * FROM pacts WHERE pact_id = ${input.pactId} FOR UPDATE
        `;
        const current = rows[0];
        if (!current) throw new Error("Pact not found");
        const normalized = {
          escrowAddress: address(input.escrowAddress, "escrowAddress"),
          transactionHash: hash(input.fundingTransactionHash, "fundingTransactionHash"),
          onchainPactId: hash(input.onchainPactId, "onchainPactId"),
          termsHash: hash(input.termsHash, "termsHash"),
        };
        if (current.status === "FUNDED") {
          if (current.escrow_address === normalized.escrowAddress
            && current.funding_transaction_hash === normalized.transactionHash
            && current.onchain_pact_id === normalized.onchainPactId
            && current.terms_hash === normalized.termsHash
            && current.refund_after?.toISOString() === input.refundAfter) return pact(current);
          throw new Error("Pact is already funded with different onchain evidence");
        }
        if (current.status !== "DRAFT") throw new Error("Only a draft pact can be funded");
        const updated = await tx<readonly PactRow[]>`
          UPDATE pacts SET
            escrow_address = ${normalized.escrowAddress},
            funding_transaction_hash = ${normalized.transactionHash},
            onchain_pact_id = ${normalized.onchainPactId},
            terms_hash = ${normalized.termsHash},
            refund_after = ${input.refundAfter},
            funding_evidence_version = 1,
            status = 'FUNDED',
            updated_at = now()
          WHERE pact_id = ${input.pactId}
          RETURNING *
        `;
        return pact(updated[0]!);
      });
    },

    async createSubmission(input: CreateSubmissionInput): Promise<Submission> {
      return sql.begin(async (tx) => {
        const idempotencyKey = key(input.idempotencyKey);
        const lockedPact = await tx<readonly [{ pact_id: string; worker_address: string; status: PactStatus }]>`
          SELECT pact_id, worker_address, status FROM pacts WHERE pact_id = ${input.pactId} FOR UPDATE
        `;
        if (!lockedPact[0]) throw new Error("Pact not found");
        const existing = await tx<readonly SubmissionRow[]>`
          SELECT * FROM pact_submissions WHERE pact_id = ${input.pactId} AND idempotency_key = ${idempotencyKey}
        `;
        if (existing[0]) return submission(existing[0]);
        if (!(["FUNDED", "HELD"] as PactStatus[]).includes(lockedPact[0].status)) {
          throw new Error("Worker evidence can be submitted only for a funded or remediation-held pact");
        }
        if (lockedPact[0].worker_address !== address(input.submittedBy, "submittedBy")) {
          throw new Error("Submission signer is not the worker recorded on this pact");
        }
        const next = await tx<readonly [{ sequence: number }]>`
          SELECT COALESCE(MAX(sequence), 0)::integer + 1 AS sequence
          FROM pact_submissions WHERE pact_id = ${input.pactId}
        `;
        const rows = await tx<readonly SubmissionRow[]>`
          INSERT INTO pact_submissions (
            submission_id, pact_id, idempotency_key, sequence, submitted_by,
            artifact_hash, evidence, claimed_remediation
          ) VALUES (
            ${randomUUID()}, ${input.pactId}, ${idempotencyKey}, ${next[0]!.sequence},
            ${address(input.submittedBy, "submittedBy")}, ${hash(input.artifactHash, "artifactHash")},
            ${tx.json(input.evidence as postgres.JSONValue)}, ${input.claimedRemediation.trim()}
          ) RETURNING *
        `;
        await tx`UPDATE pacts SET status = 'SUBMITTED', updated_at = now() WHERE pact_id = ${input.pactId}`;
        return submission(rows[0]!);
      });
    },

    async getLatestSubmission(pactId: string): Promise<Submission | undefined> {
      const rows = await sql<readonly SubmissionRow[]>`
        SELECT * FROM pact_submissions WHERE pact_id = ${pactId} ORDER BY sequence DESC LIMIT 1
      `;
      return rows[0] ? submission(rows[0]) : undefined;
    },

    async beginVerification(pactId: string, submissionId: string): Promise<Pact> {
      return sql.begin(async (tx) => {
        const rows = await tx<readonly PactRow[]>`
          SELECT * FROM pacts WHERE pact_id = ${pactId} FOR UPDATE
        `;
        const current = rows[0];
        if (!current) throw new Error("Pact not found");
        if (current.status !== "SUBMITTED" && current.status !== "HELD") {
          throw new Error("Only a submitted or retry-held pact can begin verification");
        }
        const latest = await tx<readonly [{ submission_id: string }]>`
          SELECT submission_id FROM pact_submissions
          WHERE pact_id = ${pactId}
          ORDER BY sequence DESC LIMIT 1
        `;
        if (latest[0]?.submission_id !== submissionId) throw new Error("Only the latest worker submission can be verified");
        if (current.status === "HELD") {
          const latestReceipt = await tx<readonly [{ decision: string }]>`
            SELECT decision FROM pact_receipts WHERE pact_id = ${pactId} ORDER BY created_at DESC LIMIT 1
          `;
          if (latestReceipt[0]?.decision !== "RETRY") {
            throw new Error("Held worker evidence requires remediation before another verification");
          }
        }
        const updated = await tx<readonly PactRow[]>`
          UPDATE pacts SET status = 'VERIFYING', updated_at = now()
          WHERE pact_id = ${pactId} AND status = ${current.status}
          RETURNING *
        `;
        if (!updated[0]) throw new Error("Verification has already started");
        return pact(updated[0]);
      });
    },

    async completeVerification(input: CompleteVerificationInput): Promise<Receipt> {
      return sql.begin(async (tx) => {
        const idempotencyKey = key(input.idempotencyKey);
        const prior = await tx<readonly ReceiptRow[]>`
          SELECT receipt.* FROM pact_receipts receipt
          JOIN verification_runs run ON run.run_id = receipt.run_id
          WHERE run.pact_id = ${input.pactId} AND run.idempotency_key = ${idempotencyKey}
        `;
        if (prior[0]) return receipt(prior[0]);

        await tx`
          INSERT INTO verification_runs (run_id, pact_id, submission_id, idempotency_key, status, completed_at)
          VALUES (${input.runId}, ${input.pactId}, ${input.submissionId}, ${idempotencyKey}, 'COMPLETED', ${input.decision.decidedAt})
        `;
        for (const signal of input.signals) {
          await tx`
            INSERT INTO verification_signals (
              signal_id, run_id, intent, miner_id, signal_hash, verdict, confidence, observed_at
            ) VALUES (
              ${randomUUID()}, ${input.runId}, ${signal.intent}, ${signal.minerId.trim().toLowerCase()},
              ${hash(signal.signalHash, "signalHash")}, ${signal.verdict}, ${signal.confidence}, ${signal.observedAt}
            )
          `;
        }
        await tx`
          INSERT INTO settlement_decisions (
            decision_id, run_id, decision, reason, missing_intents, policy_version, decided_at
          ) VALUES (
            ${randomUUID()}, ${input.runId}, ${input.decision.decision}, ${input.decision.reason},
            ${input.decision.missingIntents as string[]}, ${input.decision.policyVersion}, ${input.decision.decidedAt}
          )
        `;
        const rows = await tx<readonly ReceiptRow[]>`
          INSERT INTO pact_receipts (
            receipt_id, pact_id, submission_id, run_id, receipt_hash, artifact_hash,
            decision, payload, settlement_transaction_hash
          ) VALUES (
            ${randomUUID()}, ${input.pactId}, ${input.submissionId}, ${input.runId},
            ${hash(input.receipt.receiptHash, "receiptHash")}, ${hash(input.receipt.artifactHash, "artifactHash")},
            ${input.receipt.decision}, ${tx.json(input.receipt.payload as postgres.JSONValue)},
            ${input.receipt.settlementTransactionHash ? hash(input.receipt.settlementTransactionHash, "settlementTransactionHash") : null}
          ) RETURNING *
        `;
        const status = input.decision.decision === "RELEASE"
          ? "APPROVED"
          : input.decision.decision === "REJECT"
            ? "REJECTED"
            : "HELD";
        await tx`UPDATE pacts SET status = ${status}, updated_at = now() WHERE pact_id = ${input.pactId}`;
        return receipt(rows[0]!);
      });
    },

    async getReceipt(id: string): Promise<Receipt | undefined> {
      const rows = await sql<readonly ReceiptRow[]>`SELECT * FROM pact_receipts WHERE receipt_id = ${id}`;
      return rows[0] ? receipt(rows[0]) : undefined;
    },

    async listReceipts(limit = 50): Promise<readonly Receipt[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("limit must be 1-100");
      const rows = await sql<readonly ReceiptRow[]>`
        SELECT * FROM pact_receipts ORDER BY created_at DESC LIMIT ${limit}
      `;
      return Object.freeze(rows.map(receipt));
    },

    async getLatestReceiptForPact(pactId: string): Promise<Receipt | undefined> {
      const rows = await sql<readonly ReceiptRow[]>`
        SELECT * FROM pact_receipts WHERE pact_id = ${pactId} ORDER BY created_at DESC LIMIT 1
      `;
      return rows[0] ? receipt(rows[0]) : undefined;
    },

    async createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest> {
      return sql.begin(async (tx) => {
        const idempotencyKey = key(input.idempotencyKey);
        const feedback = input.feedback.trim();
        if (feedback.length < 10 || feedback.length > 2_000) throw new TypeError("feedback must contain 10-2,000 characters");
        const pacts = await tx<readonly PactRow[]>`SELECT * FROM pacts WHERE pact_id = ${input.pactId} FOR UPDATE`;
        const current = pacts[0];
        if (!current) throw new Error("Pact not found");
        if (current.status !== "SUBMITTED") throw new Error("Changes can be requested only for a submitted delivery before verification");
        if (current.requester_address !== address(input.requestedBy, "requestedBy")) throw new Error("Only the recorded requester can request changes");
        const latest = await tx<readonly [{ submission_id: string }]>`
          SELECT submission_id FROM pact_submissions WHERE pact_id = ${input.pactId} ORDER BY sequence DESC LIMIT 1
        `;
        if (latest[0]?.submission_id !== input.submissionId) throw new Error("Changes must refer to the latest worker submission");
        const existing = await tx<readonly ChangeRequestRow[]>`
          SELECT * FROM pact_change_requests WHERE pact_id = ${input.pactId} AND idempotency_key = ${idempotencyKey}
        `;
        if (existing[0]) return changeRequest(existing[0]);
        const rows = await tx<readonly ChangeRequestRow[]>`
          INSERT INTO pact_change_requests (change_request_id, pact_id, submission_id, idempotency_key, requested_by, feedback)
          VALUES (${randomUUID()}, ${input.pactId}, ${input.submissionId}, ${idempotencyKey}, ${address(input.requestedBy, "requestedBy")}, ${feedback})
          RETURNING *
        `;
        await tx`UPDATE pacts SET status = 'HELD', updated_at = now() WHERE pact_id = ${input.pactId}`;
        return changeRequest(rows[0]!);
      });
    },

    async getLatestChangeRequest(pactId: string): Promise<ChangeRequest | undefined> {
      const rows = await sql<readonly ChangeRequestRow[]>`
        SELECT * FROM pact_change_requests WHERE pact_id = ${pactId} ORDER BY created_at DESC LIMIT 1
      `;
      return rows[0] ? changeRequest(rows[0]) : undefined;
    },

    close: () => sql.end({ timeout: 5 }),
  });
}

export function createPostgresPactStore(databaseUrl: string) {
  const value = databaseUrl.trim();
  if (!value) throw new TypeError("databaseUrl is required");
  return createStore(postgres(value, {
    // A page may request pact, submission, and receipt concurrently. Keeping one
    // pooled connection queues those small reads instead of opening a burst of
    // Supabase transaction-pooler connections on every refresh.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
    ssl: "require",
  }));
}

export function createPostgresPactStoreFromSql(sql: Sql) {
  return createStore(sql);
}
