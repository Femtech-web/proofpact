# ProofPact

### Verified work. Deterministic settlement.

ProofPact is the verification-and-settlement layer between **someone commissioning work** and **the payment rail**. A human or agent defines what “done” means, locks a milestone reward on Base, and receives the worker’s deliverable. ProofPact then buys independent intelligence from ranked Telegraph Miners and releases payment only when the selected policy pack passes.

> No agent gets paid merely for claiming the work is complete.

## The mental model

ProofPact does not perform the work, host the worker, replace Telegraph, or act as the wallet. It coordinates the boundary where delivered work becomes eligible for payment.

```text
Human / hiring agent
        │ creates a pact and funds its milestone
        ▼
┌──────────────────────────────────────────────────────────┐
│                         ProofPact                        │
│ policy pack · evidence collection · routing · decision  │
└──────────────────────────────────────────────────────────┘
        │                           │
        │ task + requirements       │ paid verification questions
        ▼                           ▼
Worker / worker agent       Telegraph → ranked Miners
        │                           │
        │ artifact + evidence       │ independent answers
        └──────────────┬────────────┘
                       ▼
              deterministic policy
               │                  │
         fail / unclear          pass
               │                  │
       hold or remediation   EIP-712 release
               │                  ▼
               └────────── Base escrow
                                  │
                                  ▼
                         replayable receipt
```

In application-stack terms:

| Layer | Responsibility | Example |
| --- | --- | --- |
| Work source | Creates or accepts the economic task | Human requester, coding agent, agent marketplace |
| Work environment | Where delivery actually happens | GitHub, Vercel, a data pipeline, a publishing platform |
| **ProofPact** | Defines acceptance, gathers evidence, buys verification, decides settlement | Policy packs, orchestration, deterministic decision, receipt |
| Intelligence market | Supplies ranked independent answers | Telegraph and its Miners |
| Payment/custody | Locks and moves the reward | ProofPact escrow on Base |
| Integration surface | Lets humans, products, and agents operate ProofPact | Web application plus a thin local MCP adapter over the same services |

ProofPact starts when a requester turns work into a funded, measurable pact. It stops after producing an auditable settlement outcome and receipt. The worker continues to work in its normal tools; Telegraph continues to own routing and Miner ranking; Base continues to own custody and execution.

Read the expanded [system boundary and walkthrough](docs/system-boundary.md).

## The problem

Agents can already write code, research, transform data, publish content, operate protocols, and pay one another. The unresolved question is: **who proves that the paid outcome was actually delivered?**

Today the answer is usually the worker, one centralized API, a marketplace operator, or a human reviewer. That does not scale to an autonomous economy. ProofPact converts completion into explicit claims, purchases independent evidence for those claims, and gives that evidence a deterministic financial consequence.

## The first proven workflow

The pack proven deeply end to end is **Secure Delivery**: pay a worker to remediate a vulnerability and deploy the corrected service.

1. The requester chooses Secure Delivery, defines the acceptance criteria, and locks USDC on Base.
2. The worker or coding agent patches the repository and deploys it through its existing GitHub/Vercel workflow.
3. The worker submits the commit, deployment URL, and evidence to ProofPact.
4. ProofPact verifies the exact public GitHub commit directly and binds its response hash into the receipt. The requester can then request written changes for free, or sign a short-lived verification authorization capped at `0.12 USDC`. ProofPact pays real Telegraph routes for `FRAUD_DETECTION`, `URL_SCAN`, and `SSL_VERIFICATION`. The milestone reward remains locked.
5. Duplicate Miner identities are refused; missing, stale, low-confidence, or malformed results cannot pass.
6. Deterministic policy returns `RELEASE`, `RETRY`, `HOLD`, or `REJECT`.
7. A failed delivery remains locked and enters remediation. A passing delivery creates bounded EIP-712 authority to release the escrow.
8. The receipt binds the policy version, artifacts, Miners, signals, costs, decision, and Base transaction.

The complete demo is deliberately causal:

**funded → unsafe delivery → paid Miner verification → payment held → remediation → fresh verification → payment released → receipt replayed**

That is stronger than displaying a changing risk score: intelligence visibly determines whether real value moves.

## Policy packs

A policy pack is a versioned acceptance program—not a visual template. It defines required evidence, Telegraph intents, confidence/freshness thresholds, remediation semantics, and settlement outcomes before funding.

| Pack | Outcome being purchased | Required intelligence | Product status |
| --- | --- | --- | --- |
| Secure Delivery | A vulnerability is fixed and safely deployed | Direct source proof + fraud, URL, SSL | Supported · live demo path |
| Research | A sourced brief answers the commissioned question | Fraud, fact, task | Supported |
| Data Work | A dataset or transformation meets an agreed quality bar | Fraud, fact, task | Supported |
| Content | Factual, original, compliant content is delivered | Fraud, fact, task | Supported |
| Growth | A campaign delivered authentic agreed outcomes | Fraud, fact, URL | Supported |
| Protocol Operations | An operational or treasury change was safely completed | Fraud, fact, URL, SSL | Supported |
| Agent Services | One agent completed a machine-readable service for another | Fraud, fact, task | Supported |

Every pack now has a strict public-evidence schema, artifact commitment, live Telegraph request adapters, deterministic settlement requirements, and positive/negative policy tests. Every pack requires `FRAUD_DETECTION`. Secure Delivery remains the recorded end-to-end demonstration; the other packs are supported but are not falsely presented as having completed their own paid design-partner runs.

## What the states mean

Think of the escrow as a locked envelope:

- `FUNDED`: the requester put money in the envelope.
- `SUBMITTED`: the worker put proof of the work beside it.
- `VERIFYING`: ProofPact is paying independent Telegraph inspectors to check that proof.
- `RETRY`: an inspector response was missing or unclear. This is not a worker failure; the requester may check the same proof again.
- `HOLD`: a conclusive check found a problem, or the requester asked for changes. The worker must submit changed evidence.
- `APPROVED`: every required check passed. The money is still locked until the Base release transaction confirms.
- `RELEASED`: Base transferred the exact reward to the recorded worker.

The receipt page is a permanent report, not the current pact page. An older receipt can still say `RETRY` after a later run succeeds; return to the pact to see the current lifecycle state and newest receipt.

## Why Telegraph is indispensable

Without Telegraph, ProofPact must trust the worker, one security API, one URL scanner, one facts provider, or its own operator. With Telegraph, the verifier comes from a ranked market and is paid per request. Better intelligence directly produces safer settlement.

This creates a useful economic flywheel:

```text
more funded pacts
      → more legitimate paid Miner requests
      → stronger competition for answer quality
      → safer and faster settlement
      → more requesters willing to fund pacts
```

One job may fund the initial verification set, bounded retries, a fresh set after remediation, and optional holdback checks. New policy packs extend that demand into additional work markets.

## Why this is different

- **The verification has authority.** Telegraph evidence controls settlement rather than decorating a dashboard.
- **Failure is a product path.** Unsafe work is held, explained, remediated, and freshly verified.
- **Independence is enforced.** Duplicate routes from one Miner cannot count twice for the same intent, and release requires at least two distinct Miner identities overall.
- **Decisions are replayable.** Replaying a receipt performs no network call, payment, signature, or execution.
- **Acceptance is frozen before work.** The funded pact commits to an immutable policy-pack version.
- **The wedge can expand.** New packs create new Telegraph demand without inventing another custody protocol.

## MCP: the agent-native interface

ProofPact now exposes a thin local stdio MCP server over the same policy, persistence, funding, authorization, and receipt services used by the web application. Codex, Claude, ChatGPT, IDE agents, and autonomous systems can list policy packs, idempotently create drafts, inspect pacts, prepare wallet-ready funding, prepare worker/requester signature messages, estimate bounded Telegraph cost, and replay receipts.

The MCP never accepts or returns private keys, never broadcasts wallet transactions, and never begins paid verification merely because an agent requested an estimate or signing payload. Its controls, tool list, and client configuration are documented in [MCP integration](docs/mcp-integration.md).

## Architecture

ProofPact is a feature-oriented Next.js modular monolith. Pure domain policy is isolated from x402, wallets, persistence, and UI. ProofRoute’s proven routing and authorization behavior is being ported behind server-only interfaces rather than copied into components.

```text
app/                         routes and server-side composition
features/
  jobs/                      pact and milestone domain
  policies/                  versioned policy-pack registry
  verification/              evidence, intents, normalization, aggregation
  settlement/                deterministic outcome policy
infrastructure/
  telegraph/                 server-only x402 and routing adapter
  settlement/                server-only Base and EIP-712 adapter
tests/                       deterministic domain and later integration tests
docs/                        public product and engineering evidence
private-notes/               internal planning; intentionally gitignored
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and invariants.

## What is real today

| Capability | Current evidence |
| --- | --- |
| Policy-pack domain model | Seven strict evidence schemas, request adapters, artifact commitments, and settlement-policy suites implemented and typechecked |
| Universal `FRAUD_DETECTION` requirement | Implemented and tested across every pack |
| Deterministic four-outcome policy | Implemented and tested |
| Miner identity deduplication | Implemented and tested |
| Database-backed workspace routes | Real pact list, idempotent draft creation, pact details, immutable receipt reads, and explicit offchain/onchain state separation; production build and live route smoke pass |
| Base Sepolia USDC x402 challenge gate | Ported and tested against mocked protocol responses |
| `FRAUD_DETECTION` request/response kernel | Artifact-bound builder, strict Engine validation, live declared-schema mapping, optional fenced prose translation, bounded response evidence, and fail-closed normalization implemented |
| Paid retry and cost boundary | Three-attempt maximum, managed DNS transport plus bounded backoff before authorization, separate authorized/settled accounting, and retry after ambiguous authorization only when expiry plus onchain evidence proves it unpaid; tested locally and against live transport failures |
| Source, URL, and SSL adapters | Exact GitHub provenance, artifact-bound Miner questions, declared-schema adapters, optional fenced prose translation, bounded response evidence, and live paid routing proven |
| Attempt ledger | Append-only application events, reconciliation events, and both PostgreSQL migrations are applied to Supabase |
| Live paid Telegraph evidence | Multiple bounded operations are recorded. Receipt `4fed2dbe-bbee-417c-a636-a2863d50affa` proved fraud and URL passes plus fail-closed handling of an in-progress SSL check. Receipt `a7245f3a-1934-481c-85c8-2be78b2f3f66` proved fraud plus SSL `A+` passes and safely retried an upstream URL acquisition failure. Fresh exact-artifact evidence then produced `RELEASE` receipt `afaf9ddb-a1a7-4c2d-b37a-5756dcfee984` without paying twice. |
| Durable pact persistence | Pact, submission, run, signal, decision, and immutable receipt tables applied to Supabase; idempotency smoke verified through the production adapter |
| ProofPact escrow and EIP-712 settlement | Deployed and independently read back on Base Sepolia at `0xda056735D5B5D4253a8c8E9B5d9AC73285F27314`; exact-USDC custody, receipt-bound release/refund permits, wallet-ready transaction adapter, and adversarial Foundry suite are implemented |
| Pact funding | Drafts now produce exact-amount USDC approval and immutable `fundPact` wallet transactions; the server advances to `FUNDED` only after matching the confirmed Base event to every persisted pact term |
| Worker delivery | A funded or remediation-held pact accepts evidence only after a time-bounded signature from its recorded worker; the signature binds repository, commit, deployment, claim, pact, nonce, and chain context but grants no settlement authority |
| Requester revision path | Signed, written, immutable change requests implemented; no Telegraph payment is made before the worker resubmits |
| Receipt-bound release interface | Implemented: the server signs a narrowly bounded EIP-712 permit, the requester submits it from the selected wallet, and ProofPact records `RELEASED` only after matching the Base event |
| End-to-end Base Sepolia demo | Complete: funded, worker-signed submission, paid verification, fail-closed retry, remediation, three-Miner `RELEASE` receipt, requester-submitted Base release, and independently matched `RELEASED` state |
| MCP server | Nine-tool local stdio adapter implemented over the proven services; read, draft, transaction-preparation, authorization-preparation, and side-effect-free receipt replay are covered |

This honesty boundary is intentional: architecture tests are not represented as live protocol evidence.

## Verify locally

```bash
cp .env.example .env.local
npm install
npm run verify
npm run verify:mcp
```

`verify` runs strict TypeScript checking, the policy tests, and a production Next.js build.

## Documentation

- [System boundary and UI walkthrough](docs/system-boundary.md)
- [Product thesis](docs/product-thesis.md)
- [Architecture](ARCHITECTURE.md)
- [Telegraph integration](docs/telegraph-integration.md)
- [Decision policy](docs/decision-policy.md)
- [Implementation plan](docs/implementation-plan.md)
- [MCP integration](docs/mcp-integration.md)
- [Security model](docs/security-model.md)
- [Judge demo](docs/demo-scenario.md)
- [Competitive position](docs/competitive-positioning.md)
- [Testing and evidence](docs/testing-and-evidence.md)
- [Submission copy](docs/submission-copy.md)
