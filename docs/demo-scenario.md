# Judge demo instructions

## Proven fast path

This path demonstrates the completed run without making another payment:

1. Open **Pacts** and select pact `29902dbb-6586-4044-83aa-d75f7720b1dd`.
2. Point out the immutable policy, requester, worker, `0.01 USDC` reward, funding transaction, escrow, and onchain pact ID.
3. Show lifecycle state `RELEASED` and **Payment released**.
4. Open receipt `afaf9ddb-a1a7-4c2d-b37a-5756dcfee984`.
5. Show decision `RELEASE`, the three independent Miner records, bounded costs, artifact hash, and receipt hash.
6. Show confirmed release transaction `0xf6c35b63ff1ac47cbb795fbaa3971734545e4abb9a93da10833896276ec07ef1`.
7. Explain that receipt replay recomputes the payload commitment without routing, paying, signing, or executing.
8. Run `npm run verify:mcp` and show that an agent can discover the same safe application surface.

## Full narrative path

The demo opens with the policy-pack library, then follows one Secure Delivery pact as a continuous causal story:

1. Select the Secure Delivery policy pack and fund a real Base Sepolia software-remediation pact.
2. Show the objective acceptance policy and locked reward.
3. A worker submits a deliberately unsafe deployment.
4. ProofPact verifies the exact GitHub commit and makes paid calls to routed Telegraph Miners for `FRAUD_DETECTION`, `URL_SCAN`, and `SSL_VERIFICATION`.
5. URL/TLS or fraud evidence fails or remains inconclusive; deterministic policy returns `HOLD`, `RETRY`, or `REJECT`.
6. Show that no settlement authority was created and payment remains locked.
7. The worker patches and redeploys.
8. ProofPact buys fresh independent checks; duplicate identities are refused.
9. All required evidence passes and policy returns `RELEASE`.
10. EIP-712 authorization releases escrow on Base Sepolia.
11. Open the public receipt and replay the decision without another route or payment.

The recorded proof used ChainSight (`302`) for fraud, NetWire (`7334`) for URL safety, and SSL Labs (`227`) for TLS. The final receipt hash is `0xd63623d37928190306f3c7c54abdca6a0b74b494367ea0abd615663c5f01db23`.

## Evidence visible on screen

- funded escrow transaction;
- worker and artifact/commit commitment;
- each intent, routed Miner identity, attempt, price, and result;
- x402 payment references;
- duplicate-Miner rejection if induced;
- policy version and exact reason;
- signal and receipt hashes;
- settlement transaction;
- replay result matching the original.

The defining moment is not a score changing. It is payment remaining locked on failed evidence and moving only after fresh verification passes.

After the receipt, return briefly to the pack library to show that research, data work, content, growth, protocol operations, and agent-to-agent services have strict schemas, adapters, and settlement policies. State clearly that Secure Delivery is the recorded end-to-end paid demonstration; the other supported packs have not each completed a design-partner run.
