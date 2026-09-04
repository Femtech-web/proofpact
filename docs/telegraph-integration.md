# Telegraph integration

Telegraph is the verification market, not a decorative data source. Its responses determine whether locked money moves. Policy packs are the demand router: each pack translates a work category into the specific paid intelligence necessary to establish completion.

## Required workflow

For the secure-delivery MVP, ProofPact requests four required intents from real routed Miners:

1. `FRAUD_DETECTION` evaluates counterparty, payment address, delivery submission, and evidence-manipulation risk.
2. `CVE_LOOKUP` verifies the vulnerability, affected range, severity, and fixed release.
3. `URL_SCAN` evaluates the delivered endpoint for malicious behavior and deployment safety.
4. `SSL_VERIFICATION` verifies TLS and domain/security posture.

`FACT_CHECK` and `AGENT_TASK` are conditional enhancements when the milestone contains factual release claims or task evidence that benefits from another independent route.

Later packs compose these same live intents differently for research, data work, content, growth, protocol operations, and agent-to-agent services. A pack may be activated only when every required intent has sufficient eligible live Miners; unsupported requirements fail before funding rather than during settlement.

## Request lifecycle

Each intent is paid independently through x402. The adapter must enforce the expected chain, supported USDC contract, maximum per-request price, maximum total verification spend, and explicit server-side authorization before signing.

A retry is allowed before payment authorization only for a classified transport or upstream HTTP failure. After authorization, ProofPact retries only when the bounded `payment-response` metadata explicitly reports `success: false` with a recognized, definitely-unsettled error. A timeout, lost response, malformed answer, or any other unclear post-authorization result is `AUTHORIZED_AMBIGUOUS` and cannot be retried automatically.

Attempts stop after three at most. The runner accounts for cumulative **authorized** USDC separately from reported **settled** USDC, and enforces the workflow ceiling before granting each authorization. This prevents a delayed or missing settlement response from making the remaining budget look larger than it is.

Every attempt produces append-only events: `STARTED`, optional `PAYMENT_AUTHORIZED`, and exactly one terminal `SUCCEEDED`, `DUPLICATE`, or `FAILED` event. Failed records contain bounded codes, hashes, sizes, and payment metadata—not arbitrary upstream bodies.

## Independence

ProofPact captures the routed Miner identity for every result. Identity comparison is case-normalized and duplicates are rejected before policy evaluation. A duplicate cannot masquerade as another independent check or satisfy two intent requirements.

The system does not pin requests to SarzOps or any team-owned Miner. If SarzOps is independently selected by Telegraph routing, it is treated exactly like another provider and remains subject to deduplication and policy.

## Evidence envelope

Every accepted result must preserve:

- canonical intent and question;
- Miner identity and route metadata;
- normalized verdict and confidence;
- raw response commitment;
- Telegraph signal hash when available;
- x402 price, payment reference, and attempt number;
- observation timestamp and freshness limit;
- parser/policy version.

Unsupported or missing fields produce `INCONCLUSIVE`, never `PASS`.

## Secure Delivery adapters

The four adapters bind their questions to the same canonical artifact commitment. `CVE_LOOKUP`, `URL_SCAN`, and `SSL_VERIFICATION` accept only explicit structured status/boolean fields. Prose, unknown labels, missing confidence, or an Intent mismatch cannot be promoted into a pass.

The PostgreSQL attempt-ledger migration is [`001_verification_attempt_events.sql`](../infrastructure/persistence/migrations/001_verification_attempt_events.sql). It includes database triggers that reject updates and deletes. Applying that migration is required before composing the live verifier with `createPostgresVerificationAttemptStore`.

For Supabase, apply the migration through the dashboard SQL Editor and use the transaction-pooler connection URI on port `6543` as the server-only `DATABASE_URL`. The Postgres.js adapter disables prepared statements for transaction-pooler compatibility and requires TLS. No Supabase anonymous key or service-role API key is required for this adapter.
