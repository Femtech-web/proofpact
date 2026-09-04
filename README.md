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
| Integration surface | Lets other products and agents operate ProofPact | Web application first; MCP after the core flow is proven |

ProofPact starts when a requester turns work into a funded, measurable pact. It stops after producing an auditable settlement outcome and receipt. The worker continues to work in its normal tools; Telegraph continues to own routing and Miner ranking; Base continues to own custody and execution.

Read the expanded [system boundary and walkthrough](docs/system-boundary.md).

## The problem

Agents can already write code, research, transform data, publish content, operate protocols, and pay one another. The unresolved question is: **who proves that the paid outcome was actually delivered?**

Today the answer is usually the worker, one centralized API, a marketplace operator, or a human reviewer. That does not scale to an autonomous economy. ProofPact converts completion into explicit claims, purchases independent evidence for those claims, and gives that evidence a deterministic financial consequence.

## The launch product

The pack we will prove deeply first is **Secure Delivery**: pay a worker to remediate a vulnerability and deploy the corrected service.

1. The requester chooses Secure Delivery, defines the CVE and acceptance criteria, and locks USDC on Base.
2. The worker or coding agent patches the repository and deploys it through its existing GitHub/Vercel workflow.
3. The worker submits the commit, deployment URL, and evidence to ProofPact.
4. ProofPact pays real Telegraph routes for `FRAUD_DETECTION`, `CVE_LOOKUP`, `URL_SCAN`, and `SSL_VERIFICATION`.
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
| Secure Delivery | A vulnerability is fixed and safely deployed | Fraud, CVE, URL, SSL | Launch pack |
| Research | A sourced brief answers the commissioned question | Fraud, fact, task | Preview |
| Data Work | A dataset or transformation meets an agreed quality bar | Fraud, fact, task | Preview |
| Content | Factual, original, compliant content is delivered | Fraud, fact, task | Preview |
| Growth | A campaign delivered authentic agreed outcomes | Fraud, fact, URL | Preview |
| Protocol Operations | An operational or treasury change was safely completed | Fraud, CVE, URL, SSL | Preview |
| Agent Services | One agent completed a machine-readable service for another | Fraud, fact, task | Preview |

Every pack requires `FRAUD_DETECTION`. Preview packs remain preview until their live Miner coverage, evidence schemas, adversarial corpus, and first design-partner pact pass release gates.

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
- **Independence is enforced.** One Miner identity cannot satisfy several apparently independent requirements.
- **Decisions are replayable.** Replaying a receipt performs no network call, payment, signature, or execution.
- **Acceptance is frozen before work.** The funded pact commits to an immutable policy-pack version.
- **The wedge can expand.** New packs create new Telegraph demand without inventing another custody protocol.

## MCP: the agent-native interface

After the Secure Delivery flow works end to end and is proven with real Telegraph payments and Base settlement, ProofPact will expose the same application use cases through an MCP server. That lets Codex, Claude, ChatGPT, IDE agents, and autonomous systems create or inspect pacts without creating a second implementation.

The MCP is deliberately sequenced after the core flow. Its non-negotiable controls are documented in [MCP integration](docs/mcp-integration.md): no exposed payer/authorizer keys, wallet-ready funding by default, deterministic settlement gating, idempotent mutations, pre-payment cost estimates, and tightly scoped authorizations.

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
| Policy-pack domain model | Implemented and typechecked |
| Universal `FRAUD_DETECTION` requirement | Implemented and tested across every pack |
| Deterministic four-outcome policy | Implemented and tested |
| Miner identity deduplication | Implemented and tested |
| Marketing and workspace routes | Production Next.js build passes |
| Base Sepolia USDC x402 challenge gate | Ported and tested against mocked protocol responses |
| `FRAUD_DETECTION` request/response kernel | Artifact-bound builder, strict Engine validation, provenance record, and fail-closed normalizer implemented |
| Paid retry and cost boundary | Three-attempt maximum, separate authorized/settled accounting, and no ambiguous post-authorization retry; tested locally |
| CVE, URL, and SSL adapters | Artifact-bound questions and strict structured normalizers implemented; live routing not yet claimed |
| Attempt ledger | Append-only application events and PostgreSQL adapter/migration implemented; migration not yet applied to a live database |
| Live paid Telegraph evidence | Not yet claimed; no paid call was made during this implementation slice |
| Durable pact persistence | Planned next |
| ProofPact escrow and EIP-712 settlement | Planned after verification kernel |
| End-to-end Base Sepolia demo | Not yet claimed |
| MCP server | Deliberately scheduled after live end-to-end proof |

This honesty boundary is intentional: architecture tests are not represented as live protocol evidence.

## Verify locally

```bash
cp .env.example .env.local
npm install
npm run verify
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
