# Telegraph integration

Telegraph is the verification market, not a decorative data source. Its responses determine whether locked money moves. Policy packs are the demand router: each pack translates a work category into the specific paid intelligence necessary to establish completion.

## Required workflow

For the secure-delivery MVP, ProofPact first verifies the exact public GitHub commit directly, then requests three required intents from real routed Miners:

1. `FRAUD_DETECTION` evaluates counterparty, payment address, delivery submission, and evidence-manipulation risk.
2. `URL_SCAN` evaluates the delivered endpoint for malicious behavior and deployment safety.
3. `SSL_VERIFICATION` verifies TLS and domain/security posture.

Repository provenance is deliberately not forced through an unsuitable Miner intent. `CONTENT_EXTRACTION` routed to an extractor that accepts inline text rather than reliably fetching the supplied commit URL, while `FACT_CHECK` routed to an encyclopaedic checker that could not inspect GitHub. ProofPact therefore verifies GitHub's authoritative commit response before spending and records its response hash, exact SHA, permalink, observation time, and matched claim terms in the receipt. `FACT_CHECK`, `CONTENT_EXTRACTION`, `WEB_SEARCH`, and `AGENT_TASK` remain available to packs whose evidence matches those Miner capabilities.

Later packs compose these same live intents differently for research, data work, content, growth, protocol operations, and agent-to-agent services. A pack may be activated only when every required intent has sufficient eligible live Miners; unsupported requirements fail before funding rather than during settlement.

## Request lifecycle

After the worker signs and stores evidence, the pact becomes `SUBMITTED`. Only the recorded requester then sees **Verify delivery** in the application. The requester signs a short-lived authorization binding the exact pact, submission, artifact hash, three intents, nonce, Base Sepolia chain, and `0.12 USDC` maximum verification cost. The server atomically advances the pact to `VERIFYING` before making a paid call, preventing another tab or caller from starting the same verification again.

Each intent is paid independently through x402. The ProofPact server payer—not the browser wallet and not the locked milestone reward—pays Telegraph. The adapter enforces the expected chain, supported USDC contract, maximum per-request price, maximum total verification spend, and the requester-signed ceiling before signing any x402 payment. The first-pass total is `0.03 USDC`; the authorization retains a hard `0.12 USDC` whole-operation ceiling and each intent remains limited to three attempts.

A retry is allowed before payment authorization only for a classified transport or upstream HTTP failure. After authorization, ProofPact retries only when the bounded `payment-response` metadata explicitly reports `success: false` with a recognized, definitely-unsettled error. A timeout, lost response, malformed answer, or any other unclear post-authorization result is `AUTHORIZED_AMBIGUOUS` and cannot be retried automatically.

Attempts stop after three at most. The runner accounts for cumulative **authorized** USDC separately from reported **settled** USDC, and enforces the workflow ceiling before granting each authorization. This prevents a delayed or missing settlement response from making the remaining budget look larger than it is.

Every attempt produces append-only events: `STARTED`, optional `PAYMENT_AUTHORIZED`, and exactly one terminal `SUCCEEDED`, `DUPLICATE`, or `FAILED` event. Failed records contain bounded codes, hashes, sizes, and payment metadata—not arbitrary upstream bodies.

## Independence

ProofPact captures the routed Miner identity for every result. Identity comparison is case-normalized. A repeat response from the same Miner never counts as a second independent result; however, an asynchronous Miner may refresh its own earlier inconclusive observation during a bounded retry. The newer observation replaces the earlier one only if it becomes conclusive, while the duplicate event remains in the audit ledger. A capable Miner may answer two different intents, but release still requires at least two distinct Miner identities across the complete verification.

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

## Live paid proof

Pact `29902dbb-6586-4044-83aa-d75f7720b1dd` has exercised both the earlier four-intent design and the corrected direct-source plus three-intent design. These runs proved payment challenge validation, bounded retry, ambiguous-payment reconciliation, identity recording, fail-closed decisions, and immutable receipts against live Telegraph routes.

The latest run on 7 September 2026 produced receipt `4fed2dbe-bbee-417c-a636-a2863d50affa`. ChainSight (`302`) passed `FRAUD_DETECTION`, NetWire (`7334`) passed `URL_SCAN`, and SSL Labs (`227`) returned `DNS / Resolving domain names`. The operation authorized `0.07 USDC`, settled `0.05 USDC`, remained below its `0.12 USDC` ceiling, and returned `RETRY`. ProofPact therefore kept escrow locked. The runner now distinguishes a duplicate independent signal from a same-Miner refresh of an asynchronous check, and deterministically recognizes completed SSL Labs grades.

A later run produced fresh ChainSight fraud and SSL Labs `A+` passes, while its routed URL Miner failed to acquire evidence because the Miner's own Firecrawl dependency returned HTTP 402. ProofPact did not reinterpret that failure as success or pay it again. Instead, it composed the earlier still-fresh NetWire URL pass only after matching the exact submission, artifact, policy version, required intent set, query hash, confidence threshold, freshness window, and Miner-independence rule. This produced `RELEASE` receipt `afaf9ddb-a1a7-4c2d-b37a-5756dcfee984` with zero new spend and explicit links to both source receipts.

## Secure Delivery adapters

The three Telegraph adapters bind their questions to the same canonical artifact commitment and repeat the exact repository, commit, deployment URL, and relevant claim in the visible Miner question rather than assuming every Miner consumes the auxiliary context object. Before those paid calls, the GitHub verifier resolves the submitted SHA against the named repository, requires the canonical commit permalink, checks the commit message and changed-file patches against the remediation claim, and hashes the complete bounded response. Telegraph adapters first accept known explicit fields, then may apply the selected Miner's public `signal_mapping`. A fenced Groq fallback may translate otherwise usable prose; it cannot add facts, decide settlement, or bypass the `0.75` confidence gate.

Each receipt records the normalization path and up to 24 KiB of redacted response evidence for diagnosis and replay. Oversized content is replaced by a bounded redacted head/tail preview, sensitive-looking fields are redacted, and the exact unmodified Engine response remains bound by `raw_response_hash`.

A held pact is a remediation loop, not a terminal failure. The latest receipt explains the missing or failed checks, the requester sees that escrow remains locked, and the recorded worker gets a direct revised-evidence form. ProofPact refuses an identical artifact commitment so a requester cannot accidentally pay Miners repeatedly for the same repository, commit, deployment, and claim.

The browser does not treat one long HTTP response as the source of truth. While verification runs, it polls a read-only persisted-status route. If the original Server Action response is delayed or lost, the interface still discovers the immutable receipt, shows the final policy decision, and re-enables local controls. Refreshing a `VERIFYING` pact resumes status observation rather than authorizing another payment.

The PostgreSQL attempt-ledger migration is [`001_verification_attempt_events.sql`](../infrastructure/persistence/migrations/001_verification_attempt_events.sql). It includes database triggers that reject updates and deletes. Applying that migration is required before composing the live verifier with `createPostgresVerificationAttemptStore`.

For Supabase, apply the migration through the dashboard SQL Editor and use the transaction-pooler connection URI on port `6543` as the server-only `DATABASE_URL`. The Postgres.js adapter disables prepared statements for transaction-pooler compatibility and requires TLS. No Supabase anonymous key or service-role API key is required for this adapter.
