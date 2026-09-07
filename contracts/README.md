# ProofPact escrow

`ProofPactEscrow` holds a single configured ERC-20 reward per pact. Pact terms are immutable once funded. A release or policy-driven refund requires an unexpired EIP-712 permit binding the pact, receipt, terms, action, recipient, token, amount, nonce, chain, and escrow address. The requester retains a permissionless recovery path after the pact's agreed refund time.

## Verify

```bash
forge fmt --check
forge test
```

The deployment must use the official USDC address for its target chain and a bounded maximum pact amount. The owner and settlement authorizer should be separate operational roles.

## Base Sepolia deployment

Set a dedicated deployer key, the long-lived owner address, and the existing server authorizer key. The deploy script fixes the token to official Base Sepolia USDC and defaults the per-pact cap to `10,000 USDC`.

```bash
forge script --root contracts contracts/script/DeployProofPactEscrow.s.sol:DeployProofPactEscrow \
  --offline \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

After deployment, set `PROOFPACT_ESCROW_ADDRESS` to the resulting contract address and run `npm run verify:escrow` from the application root. The verifier reads the deployed bytecode, owner, authorizer, token, and amount cap directly from Base Sepolia. Do not use the settlement authorizer key as the deployer key.

### Verified deployment

- Network: Base Sepolia (`84532`)
- Escrow: `0xda056735D5B5D4253a8c8E9B5d9AC73285F27314`
- Deployment transaction: `0x5578fbe2413b0ef3dfcd37c3615293fecab9e7b1f4d96b83821497246de535ed`
- Token: official Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
- Maximum pact amount: `10,000 USDC`

The deployment receipt succeeded in block `46437980`. A subsequent RPC read verified `5,633` bytes of runtime bytecode and matched every configured constructor value.
