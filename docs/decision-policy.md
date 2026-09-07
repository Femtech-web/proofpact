# Deterministic decision policy

ProofPact has four outcomes shared by every policy pack:

| Decision | Meaning | Settlement effect |
| --- | --- | --- |
| `RELEASE` | Every required intent produced fresh, conclusive, policy-compliant evidence from unique Miners | Authorize escrow release |
| `RETRY` | Required evidence is missing, malformed, stale, low-confidence, or inconclusive and retry budget remains | Keep locked and route again |
| `HOLD` | A delivery/security requirement failed but remediation is allowed | Keep locked and request a new submission |
| `REJECT` | Conclusive fraud/manipulation or another terminal condition is established | Keep locked and enter dispute/refund path |

## Pack resolution

A pact stores the selected pack ID and immutable version at funding time. That version defines required intents, evidence fields, thresholds, freshness, retry limits, and whether a failed requirement is remediable. Evaluation never reads mutable “latest pack” settings.

`FRAUD_DETECTION` is required by every pack. Research, data work, content, growth, protocol operations, and agent-to-agent service packs then compose the domain-specific intents necessary to prove their outcomes.

## Secure Delivery V1 thresholds

- Required source proof: GitHub must bind the submitted repository, exact commit SHA, canonical permalink, and remediation claim before paid routing begins.
- Required Telegraph intents: `FRAUD_DETECTION`, `URL_SCAN`, and `SSL_VERIFICATION`.
- Minimum normalized confidence: `0.75`.
- One accepted signal per Miner identity per intent, with at least two distinct Miner identities across the complete verification.
- No required `FAIL` or `INCONCLUSIVE` may coexist with `RELEASE`.
- A conclusive `FRAUD_DETECTION: FAIL` is terminal `REJECT`.
- Another required failure yields `HOLD` when remediation is possible.

These thresholds are versioned as `DELIVERY_V1`. Changing them creates a new policy version rather than rewriting old receipts. Other policy packs receive their own explicit version and truth table.

## Replay

Replay consumes the immutable artifact commitment and persisted evidence envelope, re-runs the pure policy, and recomputes the receipt hash. It performs no routing, payment, signing, or chain execution.
