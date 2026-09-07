CREATE TABLE IF NOT EXISTS pacts (
  pact_id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  requester_address TEXT NOT NULL CHECK (requester_address ~ '^0x[0-9a-f]{40}$'),
  worker_address TEXT NOT NULL CHECK (worker_address ~ '^0x[0-9a-f]{40}$'),
  policy_pack_id TEXT NOT NULL CHECK (policy_pack_id IN ('secure-delivery', 'research', 'data-work', 'content', 'growth', 'protocol-operations', 'agent-services')),
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  acceptance_criteria TEXT NOT NULL CHECK (length(acceptance_criteria) BETWEEN 1 AND 5000),
  reward_usdc NUMERIC(18, 6) NOT NULL CHECK (reward_usdc > 0),
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  escrow_address TEXT CHECK (escrow_address IS NULL OR escrow_address ~ '^0x[0-9a-f]{40}$'),
  funding_transaction_hash TEXT CHECK (funding_transaction_hash IS NULL OR funding_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FUNDED', 'SUBMITTED', 'VERIFYING', 'HELD', 'APPROVED', 'RELEASED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pacts_requester_created_idx ON pacts (requester_address, created_at DESC);
CREATE INDEX IF NOT EXISTS pacts_worker_created_idx ON pacts (worker_address, created_at DESC);
CREATE INDEX IF NOT EXISTS pacts_status_created_idx ON pacts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS pact_submissions (
  submission_id UUID PRIMARY KEY,
  pact_id UUID NOT NULL REFERENCES pacts(pact_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  submitted_by TEXT NOT NULL CHECK (submitted_by ~ '^0x[0-9a-f]{40}$'),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^0x[0-9a-f]{64}$'),
  evidence JSONB NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  claimed_remediation TEXT NOT NULL CHECK (length(claimed_remediation) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pact_id, idempotency_key),
  UNIQUE (pact_id, sequence)
);

CREATE INDEX IF NOT EXISTS pact_submissions_pact_created_idx ON pact_submissions (pact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_runs (
  run_id UUID PRIMARY KEY,
  pact_id UUID NOT NULL REFERENCES pacts(pact_id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL REFERENCES pact_submissions(submission_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  status TEXT NOT NULL CHECK (status IN ('COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (pact_id, idempotency_key),
  UNIQUE (run_id, submission_id)
);

CREATE INDEX IF NOT EXISTS verification_runs_submission_idx ON verification_runs (submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_signals (
  signal_id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES verification_runs(run_id) ON DELETE RESTRICT,
  intent TEXT NOT NULL,
  miner_id TEXT NOT NULL CHECK (length(miner_id) BETWEEN 1 AND 200),
  signal_hash TEXT NOT NULL CHECK (signal_hash ~ '^0x[0-9a-f]{64}$'),
  verdict TEXT NOT NULL CHECK (verdict IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, miner_id)
);

CREATE INDEX IF NOT EXISTS verification_signals_run_idx ON verification_signals (run_id);

CREATE TABLE IF NOT EXISTS settlement_decisions (
  decision_id UUID PRIMARY KEY,
  run_id UUID NOT NULL UNIQUE REFERENCES verification_runs(run_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('RELEASE', 'RETRY', 'HOLD', 'REJECT')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  missing_intents TEXT[] NOT NULL DEFAULT '{}',
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 1 AND 80),
  decided_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pact_receipts (
  receipt_id UUID PRIMARY KEY,
  pact_id UUID NOT NULL REFERENCES pacts(pact_id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL REFERENCES pact_submissions(submission_id) ON DELETE RESTRICT,
  run_id UUID NOT NULL UNIQUE REFERENCES verification_runs(run_id) ON DELETE RESTRICT,
  receipt_hash TEXT NOT NULL UNIQUE CHECK (receipt_hash ~ '^0x[0-9a-f]{64}$'),
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^0x[0-9a-f]{64}$'),
  decision TEXT NOT NULL CHECK (decision IN ('RELEASE', 'RETRY', 'HOLD', 'REJECT')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  settlement_transaction_hash TEXT CHECK (settlement_transaction_hash IS NULL OR settlement_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pact_receipts_pact_created_idx ON pact_receipts (pact_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_proofpact_evidence_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE immutable_table TEXT;
BEGIN
  FOREACH immutable_table IN ARRAY ARRAY['pact_submissions', 'verification_runs', 'verification_signals', 'settlement_decisions', 'pact_receipts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_no_update ON %I', immutable_table, immutable_table);
    EXECUTE format('CREATE TRIGGER %I_no_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation()', immutable_table, immutable_table);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_no_delete ON %I', immutable_table, immutable_table);
    EXECUTE format('CREATE TRIGGER %I_no_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation()', immutable_table, immutable_table);
  END LOOP;
END;
$$;
