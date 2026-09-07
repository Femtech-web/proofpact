# MCP integration

## Purpose

ProofPact's MCP server makes the proven application services available to coding agents and autonomous systems without browser automation. It is a thin adapter, not a second backend:

```text
Web UI ─────┐
            ├── application services → domain policy → infrastructure
MCP stdio ──┘
```

Both paths use the same policy-pack registry, PostgreSQL pact store, funding-plan builder, requester authorization format, receipt payload, and canonical hash logic.

## Implemented tools

| Tool | Behavior | Side effect |
| --- | --- | --- |
| `list_policy_packs` | Lists versions, evidence fields, required Telegraph intents, and paid-proof status | None |
| `create_pact_draft` | Idempotently creates an unfunded pact | Database draft only |
| `get_pact` | Reads the latest pact, submission, receipt, and change request | None |
| `prepare_funding` | Returns exact Base Sepolia USDC approval and escrow calldata | None; never signs or broadcasts |
| `prepare_worker_submission` | Validates evidence and returns the exact message the recorded worker must sign | None |
| `estimate_verification` | Discloses intents, first-pass estimate, retry limit, and `0.12 USDC` ceiling | None; never routes or pays |
| `prepare_verification_authorization` | Returns a short-lived message binding requester, submission, artifact, intents, and cost ceiling | None; never starts verification |
| `get_receipt` | Reads immutable decision evidence plus the confirmed settlement projection | None |
| `replay_receipt` | Recomputes the canonical payload hash and reports whether it matches | None; never routes, pays, signs, or executes |

The MCP deliberately stops at wallet- or signature-ready outputs for financial actions. The web path verifies the corresponding signature and owns the paid orchestration. This prevents an MCP client with read access from silently acquiring spending or settlement authority.

## Run locally

Configure `.env.local`, including `DATABASE_URL`, `PROOFPACT_ESCROW_ADDRESS`, and optionally `PROOFPACT_APP_URL`, then run:

```bash
npm run mcp
```

Verify the MCP handshake, tool discovery, and a read-only call with:

```bash
npm run verify:mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "proofpact": {
      "command": "node",
      "args": [
        "--conditions=react-server",
        "--env-file=/absolute/path/to/proofpact/.env.local",
        "--import",
        "tsx",
        "/absolute/path/to/proofpact/mcp/server.ts"
      ],
      "cwd": "/absolute/path/to/proofpact"
    }
  }
}
```

## Safety properties

- Payer, authorizer, deployer, and user private keys are never tool inputs or outputs.
- Draft creation requires a caller-provided idempotency key.
- Funding returns two wallet-ready transactions and identifies the required requester wallet.
- Verification estimation and authorization preparation do not make a Telegraph request.
- The authorization message is bound to one pact, submission, artifact hash, intent set, nonce, deadline, chain, and fixed `0.12 USDC` ceiling.
- Receipt replay is side-effect free and separately reports routing, payment, signing, and execution as `false`.
- Settlement evidence comes from the append-only confirmed-event ledger; the immutable decision receipt is not rewritten.

## Production extension

The local stdio server is sufficient for an external desktop or IDE agent demonstration. A hosted multi-tenant service should add authenticated Streamable HTTP transport, caller-scoped read/write capabilities, rate limits, and durable async verification jobs before exposing mutation or paid-execution tools remotely.
