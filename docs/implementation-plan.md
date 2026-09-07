# Implementation plan

## Phase 0 — baseline (present)

- ProofRoute-derived landing visual language with ProofPact content.
- Clean workspace, pact creation, job detail, and receipt route baseline.
- Feature-oriented domain and infrastructure boundaries.
- Typed policy-pack registry covering secure delivery, research, data work, content, growth, protocol operations, and agent services.
- Deterministic four-outcome policy.
- Mandatory `FRAUD_DETECTION` gate and Miner identity deduplication.
- Domain tests and public/private documentation structure.

## Phase 1 — port the verification kernel

- [x] Port ProofRoute’s Base Sepolia USDC x402 challenge gate and official paid-fetch client.
- [x] Add an artifact-bound `FRAUD_DETECTION` question builder, strict Engine response validator, fail-closed normalizer, and provenance record.
- [x] Keep the live verifier behind a server-only composition boundary.
- [x] Add bounded retry and whole-workflow cost accounting without retrying ambiguous paid failures.
- [x] Add CVE, URL, and SSL question builders, strict response normalizers, and server-only adapters.
- [x] Put exact artifact coordinates in every Miner question, consume declared Miner mappings, add a fenced optional prose translator, and persist bounded redacted response evidence.
- [x] Add append-only PostgreSQL persistence for every route attempt, including failed and duplicate routes.
- [x] Test pre-authorization transport retry, ambiguous paid failure, explicit unsettled failure, wrong intent, wrong network/token, excessive price, duplicate Miner, malformed answer, and cumulative cost ceilings.
- [x] Apply the attempt ledger to Supabase and prove live paid fraud, URL, and SSL routing with fail-closed receipts.

## Phase 2 — durable pacts

- [x] Add PostgreSQL persistence and migrations.
- [x] Persist immutable policy-pack versions and bind each funded pact to one version.
- [x] Implement requester and worker wallet signatures and role gates.
- [x] Add Server Actions for pact creation, funding reconciliation, submission, and requester verification authorization.
- [x] Recover long verification responses through independent receipt/status polling, including after a page refresh.
- Verify GitHub webhooks and bind commits/deployments to submissions.
- [x] Make jobs and receipts shareable by stable identifiers.
- [x] Make `HELD` actionable with receipt review, worker remediation handoff, and identical-artifact rejection.

## Phase 3 — onchain settlement

- [x] Implement and adversarially test the Base escrow contract.
- [x] Port ProofRoute EIP-712 authorization and replay protection.
- [x] Bind policy version, receipt hash, job, recipient, amount, nonce, deadline, chain, and contract into the signature.
- [x] Deploy and verify on Base Sepolia; record deployment evidence.
- [x] Prove one live receipt-bound release transaction.

## Phase 4 — complete product loop

- [x] Orchestrate paid multi-intent verification with bounded retries, global cost limits, ambiguous-payment reconciliation, and Miner deduplication.
- [x] Add remediation and fresh worker submissions.
- [ ] Move execution itself behind a durable asynchronous job boundary; persisted browser progress polling is implemented, but the initiating Server Action still owns the worker process.
- [ ] Add milestone holdbacks.
- [x] Give all seven packs typed evidence schemas, live request builders, mandatory fraud coverage, artifact commitments, and policy tests; distinguish supported packs from Secure Delivery's deeper paid proof.
- Render real Miner identities, costs, answers, and signal hashes.
- Add scheduled post-deployment checks without implying clawback.
- Complete accessibility, responsive, empty, loading, degraded, and failure states.

## Phase 5 — prove the end-to-end path

- [x] Run the full unsafe → hold → patch → release demo.
- [x] Publish replay instructions, test matrix, receipts, payment references, and Base transactions.
- [x] Treat this live proof as the release gate for beginning MCP work.

## Phase 6 — MCP adapter

- [x] Expose safe existing application use cases through a local stdio MCP server.
- [x] Require idempotency keys for draft mutation and keep transaction/signature operations preparatory.
- [x] Return wallet-ready funding data by default; never expose payer or authorizer keys.
- [x] Require cost disclosure and explicit authorization preparation before paid verification.
- [x] Reuse the same policy, funding, authorization, persistence, and receipt hashing services as the web path.
- [ ] Add authenticated Streamable HTTP transport and caller scopes before remote multi-tenant use.

## Phase 7 — external-agent proof and launch

- Demonstrate one external agent creating, monitoring, or submitting to a real pact through MCP.
- Recruit design partners and measure funded pacts, completion rate, routed calls, paid Miner spend, remediation cycles, and settlement volume.

## Phase 8 — policy-pack expansion

- Validate one real design partner and evidence corpus per new work category.
- Release research and agent-service packs first, followed by data, content, growth, and protocol operations.
- Measure Miner demand and dispute/hold rates per pack before widening eligibility.

## Immediate next action

Deploy the web application, configure its public URL, and run production smoke checks. The end-to-end Base flow and thin local MCP adapter are complete. Before production scale, move long verification behind a durable asynchronous job boundary and add authenticated Streamable HTTP MCP transport; neither is required to demonstrate the proven hackathon flow.
