# ProofPact architecture

## Design goals

- Make Telegraph intelligence causally responsible for settlement.
- Keep decisions deterministic, replayable, and independent of UI state.
- Keep payer and authorizer keys exclusively on the server.
- Preserve ProofRoute’s proven safety kernel without preserving its product-specific console.
- Start as a modular monolith: one deployable Next.js application with explicit internal boundaries.

## System flow

```text
Requester funds pact on Base
          │
Worker submits artifact + evidence
          │
Verification orchestrator
          ├── FRAUD_DETECTION ──┐
          ├── CVE_LOOKUP ───────┤
          ├── URL_SCAN ─────────┼── ranked Telegraph Miners via x402
          ├── SSL_VERIFICATION ─┤
          └── optional intents ─┘
          │
Normalize + reject duplicate Miner identities
          │
Pure deterministic policy
          ├── RELEASE → EIP-712 authorization → Base escrow
          ├── RETRY   → buy missing/inconclusive evidence within caps
          ├── HOLD    → remediation required; funds remain locked
          └── REJECT  → terminal fraud/material-invalidity outcome
          │
Replayable receipt + settlement transaction
```

Before this flow begins, the requester selects a versioned policy pack. The pack supplies the required intents, evidence schema, thresholds, and remediation semantics. The orchestrator and decision engine consume the frozen pack version rather than UI-selected ad hoc rules.

## Code boundaries

`app/` owns routing and composition. Pages are Server Components by default. Interactive islands are added only where user interaction requires them. UI mutations use Server Actions; external clients and verified webhooks use thin Route Handlers.

`features/<feature>/domain` contains pure TypeScript with no framework, network, database, or wallet dependencies. `features/policies/domain` owns the policy-pack registry and version resolution. `features/<feature>/application` will orchestrate use cases against ports. `features/<feature>/ui` renders feature-specific state.

`infrastructure/` implements ports for Telegraph/x402, Base contracts, persistence, and source-control evidence. Every file that can touch credentials imports `server-only`. Verification attempts use an append-only event port; the PostgreSQL adapter is replaceable without leaking SQL into the application use case.

Dependencies point inward:

```text
app/UI → application use cases → domain
                   ↑
       infrastructure adapters
```

The domain never imports Next.js, viem, x402, or a database client.

After the web flow has live end-to-end proof, an MCP transport will sit beside Next.js and invoke the same application use cases. It will not receive a separate policy or settlement implementation.

## Route baseline

| Route | Purpose |
| --- | --- |
| `/` | Marketing and product thesis; ProofRoute visual language with ProofPact copy |
| `/app` | Operational overview and current verification state |
| `/app/jobs/new` | Choose a policy pack, define acceptance criteria, and fund a pact |
| `/app/policies` | Inspect launch and preview packs, required intents, and release status |
| `/app/jobs/[jobId]` | Review submission, signals, policy outcome, and settlement state |
| `/app/receipts/[receiptId]` | Public/replayable decision receipt |
| `/api/health` | Deployment health probe |

## Reuse boundary from ProofRoute

These capabilities are reused as an internal verification kernel, not duplicated ad hoc:

1. x402 paid routing;
2. Miner identity deduplication;
3. bounded retry and total-cost caps;
4. deterministic decisions;
5. multi-intent aggregation;
6. replayable receipts;
7. EIP-712 authorization;
8. Base execution.

Before each ProofRoute module is ported, its dependencies and invariants are extracted behind a ProofPact port. This prevents legacy UI assumptions from leaking into job settlement.

## Runtime decisions

- Node.js runtime for all paid routing, signing, and persistence.
- Server Components for initial reads and detail views.
- Server Actions for authenticated requester/worker mutations.
- Route Handlers only for public APIs, health, and GitHub/provider webhooks.
- No client bundle receives an RPC signing key, x402 payer key, Telegraph payment material, or database credential.

## Persistence model

The first durable schema requires `policy_packs`, `policy_pack_versions`, `pacts`, `milestones`, `submissions`, `verification_runs`, `miner_signals`, `settlement_decisions`, `authorizations`, and `receipts`. Signals are append-only. A pact freezes its pack version at funding; a decision references that version and an exact ordered list of accepted signal hashes.

## Non-negotiable invariants

- A `RELEASE` requires every intent declared by the selected pack, including universal `FRAUD_DETECTION`.
- One Miner identity can count at most once in a verification set.
- Missing, malformed, stale, or inconclusive evidence never becomes an implicit pass.
- Retries stop at explicit per-intent attempt and total-USDC limits.
- Post-authorization ambiguity never retries; only an explicit recognized unsuccessful settlement may retry.
- Authorized spend and reported settled spend are accounted independently.
- Paid duplicate Miner routes are persisted and charged but never satisfy independence.
- Replays never route, pay, sign, or execute.
- Settlement calldata, chain, escrow, recipient, value, nonce, deadline, policy version, and receipt hash are covered by authorization.
- A post-deployment regression may stop a holdback milestone; the product never promises impossible clawbacks.
