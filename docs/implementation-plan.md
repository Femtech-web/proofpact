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
- [x] Add append-only PostgreSQL persistence for every route attempt, including failed and duplicate routes.
- [x] Test pre-authorization transport retry, ambiguous paid failure, explicit unsettled failure, wrong intent, wrong network/token, excessive price, duplicate Miner, malformed answer, and cumulative cost ceilings.
- [ ] Apply the attempt-ledger migration to a configured PostgreSQL database and make one authorized live fraud run.

## Phase 2 — durable pacts

- Add PostgreSQL persistence and migrations.
- Persist immutable policy-pack versions and bind each funded pact to one version.
- Implement requester and worker identity/authentication.
- Add Server Actions for pact creation and submission.
- Verify GitHub webhooks and bind commits/deployments to submissions.
- Make jobs and receipts shareable by stable identifiers.

## Phase 3 — onchain settlement

- Implement and test the Base escrow contract.
- Port ProofRoute EIP-712 authorization and replay protection.
- Bind policy version, receipt hash, job, recipient, amount, nonce, deadline, chain, and contract into the signature.
- Deploy and verify on Base Sepolia; record deployment evidence.

## Phase 4 — complete product loop

- Orchestrate paid multi-intent verification with bounded concurrency.
- Add remediation/reverification and milestone holdbacks.
- Make Secure Delivery the production-ready launch pack; keep other packs explicitly preview until their evidence schemas and test corpora pass release gates.
- Render real Miner identities, costs, answers, and signal hashes.
- Add scheduled post-deployment checks without implying clawback.
- Complete accessibility, responsive, empty, loading, degraded, and failure states.

## Phase 5 — prove the end-to-end path

- Run the full unsafe → hold → patch → release demo.
- Publish replay instructions, test matrix, receipts, payment references, and Base transactions.
- Treat this live proof as the release gate for beginning MCP work.

## Phase 6 — MCP adapter

- Expose the existing application use cases through a Streamable HTTP MCP server.
- Add read/write scope separation, caller authentication, idempotency keys, and stable errors.
- Return wallet-ready funding data by default; never expose payer or authorizer keys.
- Require cost disclosure and explicit authorization before paid verification.
- Verify that MCP and web paths produce identical policy decisions and receipt hashes.

## Phase 7 — external-agent proof and launch

- Demonstrate one external agent creating, monitoring, or submitting to a real pact through MCP.
- Recruit design partners and measure funded pacts, completion rate, routed calls, paid Miner spend, remediation cycles, and settlement volume.

## Phase 8 — policy-pack expansion

- Validate one real design partner and evidence corpus per new work category.
- Release research and agent-service packs first, followed by data, content, growth, and protocol operations.
- Measure Miner demand and dispute/hold rates per pack before widening eligibility.

## Immediate next action

Complete Phase 1’s live proof: apply the PostgreSQL attempt-ledger migration, compose the live fraud verifier with the durable store, and make one explicitly authorized routed request. Then begin Phase 2 pact/submission persistence. Do not begin the MCP server until Phases 1–5 prove the browser flow with real x402 and Base Sepolia evidence.
