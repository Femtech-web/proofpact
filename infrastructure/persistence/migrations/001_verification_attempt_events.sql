CREATE TABLE IF NOT EXISTS verification_attempt_events (
  event_id UUID PRIMARY KEY,
  run_id TEXT NOT NULL,
  pact_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('STARTED', 'PAYMENT_AUTHORIZED', 'SUCCEEDED', 'DUPLICATE', 'FAILED')
  ),
  miner_id TEXT,
  authorized_amount_usdc NUMERIC(18, 6),
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, attempt_number, event_type)
);

CREATE INDEX IF NOT EXISTS verification_attempt_events_pact_time_idx
  ON verification_attempt_events (pact_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS verification_attempt_events_run_time_idx
  ON verification_attempt_events (run_id, occurred_at ASC);

CREATE OR REPLACE FUNCTION reject_verification_attempt_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_attempt_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verification_attempt_events_no_update ON verification_attempt_events;
CREATE TRIGGER verification_attempt_events_no_update
BEFORE UPDATE ON verification_attempt_events
FOR EACH ROW EXECUTE FUNCTION reject_verification_attempt_event_mutation();

DROP TRIGGER IF EXISTS verification_attempt_events_no_delete ON verification_attempt_events;
CREATE TRIGGER verification_attempt_events_no_delete
BEFORE DELETE ON verification_attempt_events
FOR EACH ROW EXECUTE FUNCTION reject_verification_attempt_event_mutation();
