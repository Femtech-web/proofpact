ALTER TABLE pacts
  ADD COLUMN IF NOT EXISTS onchain_pact_id TEXT,
  ADD COLUMN IF NOT EXISTS terms_hash TEXT,
  ADD COLUMN IF NOT EXISTS refund_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funding_evidence_version SMALLINT;

ALTER TABLE pacts ALTER COLUMN funding_evidence_version SET DEFAULT 1;

ALTER TABLE pacts DROP CONSTRAINT IF EXISTS pacts_onchain_pact_id_format;
ALTER TABLE pacts ADD CONSTRAINT pacts_onchain_pact_id_format
  CHECK (onchain_pact_id IS NULL OR onchain_pact_id ~ '^0x[0-9a-f]{64}$');
ALTER TABLE pacts DROP CONSTRAINT IF EXISTS pacts_terms_hash_format;
ALTER TABLE pacts ADD CONSTRAINT pacts_terms_hash_format
  CHECK (terms_hash IS NULL OR terms_hash ~ '^0x[0-9a-f]{64}$');
ALTER TABLE pacts DROP CONSTRAINT IF EXISTS pacts_funding_evidence_complete;
ALTER TABLE pacts ADD CONSTRAINT pacts_funding_evidence_complete CHECK (
  (funding_evidence_version IS NULL AND funding_transaction_hash IS NULL AND escrow_address IS NULL
    AND onchain_pact_id IS NULL AND terms_hash IS NULL AND refund_after IS NULL)
  OR
  (funding_evidence_version = 1 AND (
    (status = 'DRAFT' AND funding_transaction_hash IS NULL AND escrow_address IS NULL
      AND onchain_pact_id IS NULL AND terms_hash IS NULL AND refund_after IS NULL)
    OR
    (status <> 'DRAFT' AND funding_transaction_hash IS NOT NULL AND escrow_address IS NOT NULL
      AND onchain_pact_id IS NOT NULL AND terms_hash IS NOT NULL AND refund_after IS NOT NULL)
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS pacts_funding_transaction_unique_idx
  ON pacts (funding_transaction_hash) WHERE funding_transaction_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pacts_onchain_pact_unique_idx
  ON pacts (chain_id, escrow_address, onchain_pact_id) WHERE onchain_pact_id IS NOT NULL;
