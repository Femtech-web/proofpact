CREATE TABLE IF NOT EXISTS pact_change_requests (
  change_request_id UUID PRIMARY KEY,
  pact_id UUID NOT NULL REFERENCES pacts(pact_id) ON DELETE RESTRICT,
  submission_id UUID NOT NULL REFERENCES pact_submissions(submission_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  requested_by TEXT NOT NULL CHECK (requested_by ~ '^0x[0-9a-f]{40}$'),
  feedback TEXT NOT NULL CHECK (length(feedback) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pact_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS pact_change_requests_pact_idx
  ON pact_change_requests (pact_id, created_at DESC);

DROP TRIGGER IF EXISTS pact_change_requests_no_update ON pact_change_requests;
CREATE TRIGGER pact_change_requests_no_update
  BEFORE UPDATE ON pact_change_requests
  FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation();
DROP TRIGGER IF EXISTS pact_change_requests_no_delete ON pact_change_requests;
CREATE TRIGGER pact_change_requests_no_delete
  BEFORE DELETE ON pact_change_requests
  FOR EACH ROW EXECUTE FUNCTION reject_proofpact_evidence_mutation();

