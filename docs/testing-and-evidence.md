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

The local suite covers retry classification, separate authorization/settlement accounting, attempt-event persistence semantics, duplicate routes, and strict Secure Delivery normalization. It does not prove a live x402 settlement or a deployed PostgreSQL migration; those require captured integration evidence.
