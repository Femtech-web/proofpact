# Submission copy

## Project name

ProofPact

## Tagline

Verified work. Deterministic settlement.

## One-line description

ProofPact is a verified settlement layer where paid Telegraph Miner intelligence determines whether a funded Base milestone is released, held for remediation, retried, or rejected.

## Short submission description

ProofPact lets a human or agent fund measurable work on Base and pay the worker only after independent verification. A worker signs exact delivery evidence; the requester authorizes a bounded verification budget; ProofPact buys routed `FRAUD_DETECTION`, `URL_SCAN`, and `SSL_VERIFICATION` intelligence through Telegraph x402; and deterministic policy decides whether escrow remains locked or becomes eligible for release. Every decision is captured in a replayable receipt.

The live Secure Delivery proof completed the full path: Base Sepolia funding, worker-signed evidence, paid multi-Miner verification, fail-closed retries, remediation, a three-Miner `RELEASE` decision, requester-submitted settlement, and a confirmed transfer to the recorded worker.

## Full submission description

Autonomous agents can already perform and pay for work, but there is no neutral layer that proves the delivered outcome deserves payment. ProofPact sits between the work environment and the payment rail. It freezes acceptance criteria before funding, collects signed evidence after delivery, purchases independent intelligence from Telegraph's ranked Miner market, and applies a deterministic settlement policy.

The first end-to-end policy pack is Secure Delivery. It verifies an exact public source commit and buys independent fraud, URL, and TLS checks. Missing, malformed, stale, duplicated, or low-confidence evidence fails closed. Failed work remains funded but held for written remediation; passing work produces narrowly scoped EIP-712 release authority. The requester still submits the final Base transaction, and ProofPact advances to `RELEASED` only after matching the confirmed escrow event to the pact, receipt, worker, token, and amount.

This makes Telegraph economically indispensable rather than decorative: routed intelligence directly controls whether real value moves, and every remediation cycle creates legitimate new demand for competing Miners.

## How Telegraph is used

- Real x402 payment challenges are validated for Base Sepolia, official USDC, recipient, price, and expiry before signing.
- Ranked Miners answer three artifact-bound intents: `FRAUD_DETECTION`, `URL_SCAN`, and `SSL_VERIFICATION`.
- Attempts are persisted with Miner identity, query and response commitments, payment reference, cost, verdict, confidence, and observation time.
- Duplicate identities do not create fake independence.
- Three attempts per intent and a `0.12 USDC` global authorization ceiling bound cost.
- Ambiguous post-payment outcomes stop automatically until settlement can be reconciled.
- Deterministic policy—not an LLM—returns `RELEASE`, `RETRY`, `HOLD`, or `REJECT`.

## Proven public evidence

- Base Sepolia escrow: `0xda056735D5B5D4253a8c8E9B5d9AC73285F27314`
- Funded pact: `29902dbb-6586-4044-83aa-d75f7720b1dd`
- Release receipt: `afaf9ddb-a1a7-4c2d-b37a-5756dcfee984`
- Receipt hash: `0xd63623d37928190306f3c7c54abdca6a0b74b494367ea0abd615663c5f01db23`
- Funding transaction: `0x62cc956d2893cd0b287e66219d2a7eba5f012c4c85f20717776de175e3310564`
- Release transaction: `0xf6c35b63ff1ac47cbb795fbaa3971734545e4abb9a93da10833896276ec07ef1`
- Passing Miners: ChainSight (`302`), NetWire (`7334`), and SSL Labs (`227`)

## Honest scope

Secure Delivery is the paid end-to-end demonstration. Six additional packs have typed evidence schemas, artifact-bound Telegraph adapters, fraud coverage, and deterministic policy tests, but are not represented as having completed separate design-partner runs. The MCP server is a thin local stdio adapter over the same application services; it prepares wallet/signature actions and never exports or accepts private keys.
