ALTER TABLE pacts DROP CONSTRAINT IF EXISTS pacts_status_check;
ALTER TABLE pacts ADD CONSTRAINT pacts_status_check
  CHECK (status IN ('DRAFT', 'FUNDED', 'SUBMITTED', 'VERIFYING', 'HELD', 'APPROVED', 'RELEASED', 'REJECTED'));

CREATE TABLE IF NOT EXISTS settlement_execution_events (
  event_id UUID PRIMARY KEY,
  pact_id UUID NOT NULL REFERENCES pacts(pact_id) ON DELETE RESTRICT,
  receipt_id UUID NOT NULL REFERENCES pact_receipts(receipt_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('AUTHORIZED', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
  action TEXT NOT NULL CHECK (action IN ('RELEASE', 'REFUND')),
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  escrow_address TEXT NOT NULL CHECK (escrow_address ~ '^0x[0-9a-f]{40}$'),
  token_address TEXT NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  recipient_address TEXT NOT NULL CHECK (recipient_address ~ '^0x[0-9a-f]{40}$'),
  amount_base_units NUMERIC(78, 0) NOT NULL CHECK (amount_base_units > 0),
  authorizer_address TEXT NOT NULL CHECK (authorizer_address ~ '^0x[0-9a-f]{40}$'),
  authorizer_nonce NUMERIC(78, 0) NOT NULL CHECK (authorizer_nonce >= 0),
  transaction_hash TEXT CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$'),
  failure_code TEXT CHECK (failure_code IS NULL OR length(failure_code) BETWEEN 1 AND 100),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (event_type IN ('SUBMITTED', 'CONFIRMED') AND transaction_hash IS NOT NULL AND failure_code IS NULL)
    OR (event_type = 'FAILED' AND failure_code IS NOT NULL)
    OR (event_type = 'AUTHORIZED' AND transaction_hash IS NULL AND failure_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS settlement_execution_events_pact_idx
  ON settlement_execution_events (pact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS settlement_execution_events_receipt_idx
  ON settlement_execution_events (receipt_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS settlement_execution_confirmed_receipt_idx
  ON settlement_execution_events (receipt_id) WHERE event_type = 'CONFIRMED';

DROP TRIGGER IF EXISTS settlement_execution_events_no_update ON settlement_execution_events;
CREATE TRIGGER settlement_execution_events_no_update
  BEFORE UPDATE ON settlement_execution_events
  FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation();
DROP TRIGGER IF EXISTS settlement_execution_events_no_delete ON settlement_execution_events;
CREATE TRIGGER settlement_execution_events_no_delete
  BEFORE DELETE ON settlement_execution_events
  FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation();
