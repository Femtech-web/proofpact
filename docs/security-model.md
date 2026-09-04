# Security model

## Protected assets

- escrowed funds;
- x402 payer funds;
- settlement authorizer key;
- requester/worker identities;
- artifact and signal integrity;
- deterministic policy history;
- receipt and execution replay protection.

## Principal threats and controls

| Threat | Required control |
| --- | --- |
| Worker fabricates completion | Independent, multi-intent Telegraph evidence |
| One Miner supplies several apparent votes | Canonical identity deduplication |
| Malicious or unavailable routed Miner | Strict normalization, fail-closed result, bounded pre-authorization retry |
| x402 drains payer | Network/token validation, per-call and total cost caps, explicit authorization |
| Ambiguous paid request is charged twice | No automatic retry after authorization unless settlement is explicitly reported unsuccessful |
| Operator edits attempt history | Append-only events plus PostgreSQL update/delete rejection triggers |
| UI or client steals keys | All payment/signing adapters are `server-only` |
| Artifact changes after verification | Content hash bound into decision and receipt |
| Old signal is replayed | Freshness policy plus job/artifact binding |
| Authorization is replayed or redirected | EIP-712 domain, chain, contract, job, recipient, amount, nonce, deadline, and receipt binding |
| Operator changes policy retroactively | Immutable policy version stored in every receipt |
| Post-release deployment regresses | Optional holdback milestone and scheduled checks; no false clawback promise |

## Failure posture

Unavailability, ambiguity, parse failure, stale evidence, insufficient confidence, or exhausted budget never becomes approval. Funds remain locked and the receipt explains the incomplete condition. Authorized and settled spend remain separate because absence of a payment receipt is not proof that no payment occurred.
