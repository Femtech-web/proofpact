# MCP integration plan

## Purpose

MCP makes ProofPact usable as agent-economy infrastructure. Codex, Claude, ChatGPT, IDE agents, and autonomous services can commission or deliver work without automating the browser.

It is not a second backend. The MCP server calls the same application use cases, repositories, policies, and authorization services as the Next.js interface.

```text
Web UI ─────┐
            ├── application use cases → domain → infrastructure adapters
MCP server ─┘
```

## Sequence

MCP begins only after:

1. Secure Delivery works end to end.
2. Real Telegraph x402 routes and Base Sepolia settlement are reproducibly proven.
3. Replay receipts and failure/remediation paths pass their release tests.

Then:

4. Add the MCP transport as a thin adapter.
5. Demonstrate one external agent creating, monitoring, or submitting to a real pact through MCP.

## Initial tools

| Tool | Behavior |
| --- | --- |
| `list_policy_packs` | Return active packs, versions, requirements, costs, and Miner-coverage preflight |
| `create_pact_draft` | Validate a milestone and produce a deterministic draft; no custody mutation |
| `prepare_funding` | Return bounded wallet-ready Base transaction data |
| `get_pact` | Read milestone, escrow, submission, verification, and settlement state |
| `submit_delivery` | Idempotently commit an artifact/evidence bundle |
| `estimate_verification` | Return intents, likely call count, retry ceiling, and maximum x402 spend |
| `start_verification` | Start the paid workflow only with explicit authorization and idempotency key |
| `get_verification_status` | Read attempts, unique Miners, normalized outcomes, and remaining requirements |
| `prepare_settlement` | Return settlement state; authority exists only after deterministic `RELEASE` |
| `get_receipt` | Fetch the immutable decision and settlement evidence |
| `replay_receipt` | Recompute hashes and policy without routing, paying, signing, or executing |

## Non-negotiable safety requirements

- Never expose payer or authorizer private keys through tool input, output, logs, resources, or prompts.
- Funding returns wallet-ready transaction data unless the caller possesses an explicitly delegated, bounded wallet capability.
- Deterministic policy remains the only path to settlement authority.
- Every mutation requires a caller-scoped idempotency key.
- Paid verification exposes the maximum cost before authorization.
- Authorization is scoped to pact, action, recipient, amount, chain, contract, nonce, deadline, policy version, and receipt hash.
- Read and write tools are separately authorized; a read-capable agent cannot spend or settle.
- MCP errors preserve stable machine-readable codes without leaking secrets or raw provider credentials.
- Replays are side-effect free by construction.

## Demonstration

An external coding agent reads the Secure Delivery requirements, submits its new commit and deployment through MCP, polls verification, receives a structured remediation requirement, submits the corrected artifact, and observes the final receipt. Funding remains a visible wallet decision unless a deliberately bounded delegation is configured.
