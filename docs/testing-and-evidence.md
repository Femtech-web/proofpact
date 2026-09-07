# Testing and evidence plan

## Test layers

1. **Domain:** policy truth tables, duplicate identities, confidence/freshness boundaries, receipt canonicalization.
2. **Contract:** authorization domain, replay, nonce, deadline, target/recipient/value caps, reentrancy, refund/dispute paths.
3. **Adapter:** x402 challenge validation, payment caps, retries, timeouts, malformed Miner answers, identity capture.
4. **Integration:** real Telegraph routed requests and Base Sepolia settlement.
5. **End to end:** unsafe delivery held; remediated delivery released; receipt replay matches.

## Mandatory adversarial cases

- missing `FRAUD_DETECTION` evidence;
- conclusive fraud failure;
- same Miner identity returned for two intents;
- answer claims pass but required evidence fields are absent;
- routed Miner timeout/downstream failure;
- price exceeds per-call or workflow cap;
- x402 challenge names the wrong network, asset, or recipient;
- artifact changes after verification;
- stale signal or expired authorization;
- wrong recipient/value/calldata/chain/escrow in settlement;
- replayed receipt or nonce;
- exhausted retries and unavailable Telegraph service.
- ambiguous timeout or lost response after payment authorization must stop without retry;
- explicit unsuccessful settlement may retry only for an allowlisted payment error;
- a paid duplicate Miner attempt is recorded and charged but does not satisfy independence;
- cumulative authorized spend reaches the cap before reported settled spend;
- pact references an unknown, changed, or deprecated policy-pack version;
- any policy pack omits the universal `FRAUD_DETECTION` requirement;

## Release evidence ledger

For each production claim, preserve a reproducible artifact: command, test output, route/payment receipt, Miner identity, signal hash, Base transaction, deployed address, source commit, and timestamp. Public documentation must distinguish local simulation, Base Sepolia proof, and production behavior.

The local suite covers retry classification, separate authorization/settlement accounting, attempt-event persistence semantics, duplicate routes, and strict Secure Delivery normalization. The Supabase migration and application adapter were verified on 2026-09-04 by appending and reading back the labeled run `database-smoke-20260904163542`. This does not prove a live x402 settlement; that requires a separate explicitly authorized integration run.

## Live development evidence and challenge ledger

This ledger records meaningful failures as evidence, not just the happy path. It contains no private keys, API tokens, database credentials, or signed authorization payloads.

| Date | Evidence or challenge | ProofPact behavior and resulting fix |
| --- | --- | --- |
| 2026-09-04 | Supabase production adapter wrote and read append-only event `c673eac9-a2a7-4198-9d6f-1fc5f1c7c7a5` under `database-smoke-20260904163542` | Proved transaction-pooler compatibility and immutable attempt persistence without making a payment |
| 2026-09-04 | Early routed requests reached Telegraph but returned upstream LiteLLM/Bedrock errors or an unavailable Miner hostname | Classified the post-authorization state as ambiguous, stopped automatic payment retries, waited for authorization expiry, and reconciled Base USDC logs before permitting another attempt |
| 2026-09-04 | Node/Undici intermittently timed out on a Cloudflare address while curl reached another edge | Added managed DNS transport that preserves HTTPS host identity, SNI, and certificate verification; added bounded pre-authorization backoff |
| 2026-09-05 | First successful paid route settled `0.01 USDC` in transaction `0xe35a05c90a8408cac95e6643d7df4549c598147c69a0d85c2e1f3ab1cde7abbe` | Recorded Miner `91001`, signal hash `0x452ae6aa62e7a411b1f21d07796da2d57930194e2f1cdfd61d630d3c8a0bec7d`, and correctly abstained on its low-confidence `RECHECK` response |
| 2026-09-05 | `ProofPactEscrow` deployed at `0xda056735D5B5D4253a8c8E9B5d9AC73285F27314` in transaction `0x5578fbe2413b0ef3dfcd37c3615293fecab9e7b1f4d96b83821497246de535ed` | Read back owner, authorizer, token, cap, and runtime bytecode; contract suite covered replay, substitution, expiry, reentrancy, token failure, ownership, and 512 fuzzed funding values |
| 2026-09-06 | The first pact funded `0.01 USDC` in transaction `0x62cc956d2893cd0b287e66219d2a7eba5f012c4c85f20717776de175e3310564`; an OKX smart-account relay made the outer transaction sender differ from the escrow caller | Funding confirmation now trusts the contract event only after matching the escrow and every immutable pact term; no duplicate funding transaction was sent |
| 2026-09-06 | A content-extraction route settled but returned HTTP 500; a fact-check route selected a Wikipedia-only verifier that could not inspect GitHub | Replaced unsuitable source intents with an authoritative, bounded GitHub commit verifier that records the exact SHA, permalink, response hash, observation time, and matched claim terms before any paid route |
| 2026-09-07 | Receipt `4fed2dbe-bbee-417c-a636-a2863d50affa` recorded ChainSight fraud `PASS`, NetWire URL `PASS`, and SSL Labs still resolving DNS | Policy returned `RETRY` and kept escrow locked. Same-Miner asynchronous refreshes can now replace their own earlier inconclusive record without counting as a second independent signal |
| 2026-09-07 | Receipt `a7245f3a-1934-481c-85c8-2be78b2f3f66` recorded Telegraph Sentinel fraud `PASS`, SSL Labs `A+`/`PASS`, and a `61 KB` Kriterion URL answer that remained inconclusive | Proved completed SSL normalization. Oversized answers now retain a redacted bounded preview and receive a bounded head/tail normalization input instead of being silently abandoned |
| 2026-09-07 | Receipt `afaf9ddb-a1a7-4c2d-b37a-5756dcfee984` composed the latest still-fresh exact-artifact passes from ChainSight (`302`), NetWire (`7334`), and SSL Labs (`227`) | Exact submission, artifact, policy version, required intents, query hashes, confidence, freshness, and Miner independence matched. Policy returned `RELEASE` with zero new spend; source receipts remain explicit in the composed receipt |
| 2026-09-07 | Requester submitted receipt-bound release transaction `0xf6c35b63ff1ac47cbb795fbaa3971734545e4abb9a93da10833896276ec07ef1` | ProofPact matched the Base escrow event to the pact ID, release receipt hash, recorded worker, exact `0.01 USDC` amount, and action before persisting `RELEASED`. Settlement remains an append-only event projection rather than mutating the immutable decision receipt. |

Across every live operation, each x402 challenge was validated for Base Sepolia, official USDC, recipient, amount, and expiry before signing. Attempts were limited to three per intent, the whole operation was capped at `0.12 USDC`, authorized and settled cost were recorded separately, and an unchanged receipt never moved escrow.

## Current release gate

The complete Base Sepolia proof is finished. The remaining launch operation is to deploy the web application, set `PROOFPACT_APP_URL`, run production route and MCP smoke checks, and record the public URL.

The test suite currently contains 87 passing TypeScript tests. The most recent strict typecheck and production Next.js build also pass. Historical `RETRY` receipts remain immutable and are expected to continue showing their original decisions after a later release.
