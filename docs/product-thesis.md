# Product thesis

Autonomous agents can already accept tasks, write code, deploy services, and initiate payments. The missing primitive is objective outcome settlement: who decides that paid work is genuinely complete, safe, and not manipulated?

ProofPact is a verification escrow for agent work. It converts a milestone into a set of externally verifiable claims, buys ranked intelligence for those claims through Telegraph, applies a versioned policy pack, and controls settlement on Base.

ProofPact sits after a human, agent, or marketplace commissions work and before the payment rail releases the reward. The work still happens in GitHub, Vercel, a data pipeline, or another external environment. ProofPact owns the acceptance contract, verification orchestration, deterministic decision, and receipt; Telegraph owns ranked intelligence supply; Base owns custody and final settlement. See [Where ProofPact sits](system-boundary.md) for the complete walkthrough.

## Policy packs are the product

A generic marketplace cannot know what “done” means for every kind of work. ProofPact solves this with policy packs: versioned acceptance programs that define the evidence schema, required Telegraph intents, confidence and freshness thresholds, remediation rules, and settlement result for a category of work.

The requester chooses the pack before funding. The worker can inspect its requirements before accepting. ProofPact then evaluates the submission against that frozen version, so neither party nor the application operator can quietly redefine completion after delivery.

| Policy pack | Outcome being purchased | Example evidence | Telegraph intelligence |
| --- | --- | --- | --- |
| Secure delivery | A vulnerability is fixed and safely deployed | Commit, deployment URL, CVE | Fraud, CVE, URL, SSL |
| Research | A sourced brief answers the commissioned question | Brief, source index, claim ledger | Fraud, fact, task |
| Data work | A dataset or transformation meets the agreed quality bar | Dataset hash, schema, quality report | Fraud, fact, task |
| Content | Factual, original, policy-compliant content is delivered | Artifact, sources, publishing target | Fraud, fact, task |
| Growth | A campaign delivered authentic agreed outcomes | Campaign URL, attribution report, result commitment | Fraud, fact, URL |
| Protocol operations | A treasury or operational change was safely completed | Proposal, simulation, endpoint | Fraud, CVE, URL, SSL |
| Agent services | One agent completed a machine-readable service for another | Request, deliverable, counterparty identity | Fraud, fact, task |

`FRAUD_DETECTION` is universal because fabricated evidence, malicious counterparties, wash activity, and manipulated delivery claims can affect every category. Domain-specific intents then establish whether the actual work satisfies the pact.

## Product flow

1. **Choose a pack.** The requester selects the work category and immutable policy version.
2. **Define and fund.** They add measurable criteria, reward, worker, deadline, and evidence commitments, then lock value on Base.
3. **Accept and deliver.** The worker sees the verification contract up front and submits the required artifacts.
4. **Route verification.** ProofPact buys the pack’s required intelligence from ranked Telegraph Miners through x402.
5. **Establish independence.** Duplicate Miner identities are rejected; missing, stale, low-confidence, or malformed evidence cannot pass.
6. **Apply policy.** Pure deterministic logic produces `RELEASE`, `RETRY`, `HOLD`, or `REJECT`.
7. **Remediate or settle.** A worker may submit a corrected outcome after a hold; a release authorizes Base settlement.
8. **Preserve proof.** The receipt binds pack/version, artifacts, Miners, signals, costs, decision, and settlement transaction for replay.

## Beachhead

The launch vertical is security-sensitive software delivery. It has objective artifacts, economically meaningful failures, multiple independent evidence sources, and a demo a judge can understand in seconds.

The first pact asks an agent to remediate a known vulnerability and deploy the fix. Completion is not a checkbox. It means:

- the claimed vulnerability and fixed version are factual;
- the deployed URL is safe and reachable;
- TLS/domain evidence is valid;
- the counterparty, payment, and submitted evidence do not show fraud or manipulation risk;
- the artifacts match the milestone commitment.

## Wedge and expansion

Start with software-delivery escrow, then ship policy packs for research, data work, content, growth, protocol operations, and agent-to-agent service agreements. Each pack adds purpose-built evidence and intent composition while preserving the same independent-verification-to-settlement loop.

## Business model

- 0.5–1% settlement fee;
- fixed fee per verified milestone;
- hosted team policy and approval plans;
- sponsored Telegraph verification budgets;
- enterprise audit, compliance, and evidence exports.

## Why this grows Telegraph

One paid job can create the initial verification set, bounded retries after an inconclusive result, another set after remediation, and scheduled checks for a holdback milestone. Each new policy pack opens another source of recurring, organic Miner demand without requiring a new settlement protocol.
