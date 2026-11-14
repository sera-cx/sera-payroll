# Deploying the contracts

Three contracts, all permissionless and holding no funds:

| Contract | Purpose |
|---|---|
| `PayrollDisburser` | Batched `transferFrom` payouts from the treasury. Idempotent per `(runId, payoutId)`. |
| `PayslipRegistry` | Anchors a salted Merkle root and document hash per payslip, signed by the employer (EIP-712). |
| `TestStablecoin` | Demo-only faucet stablecoin. Not for mainnet. The public demo prefers Sera.cx's own Sepolia test stablecoins so swaps work. |

## Environment

```
PRIVATE_KEY=0x...            # deployer; needs Sepolia ETH (Google's Sepolia faucet works)
SEPOLIA_RPC_URL=https://...  # any Sepolia RPC
ETHERSCAN_API_KEY=...        # optional, for --verify
DEPLOY_TEST_TOKENS=true      # set false to skip the demo stablecoins
```

## Commands

```bash
cd contracts
forge build
forge test
forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify -vvvv
```

The script prints the addresses and writes `deployments/11155111.json`. Copy the addresses into the API's env:

```
CHAIN=sepolia
RPC_URL=$SEPOLIA_RPC_URL
PAYROLL_DISBURSER_ADDRESS=0x...
PAYSLIP_REGISTRY_ADDRESS=0x...
```

The treasury wallet must `approve(PAYROLL_DISBURSER_ADDRESS, amount)` on each stablecoin it pays with before a run is sent. The web app offers that step before signing.

## Mainnet

Only `PayrollDisburser` and `PayslipRegistry` are meant for mainnet (`DEPLOY_TEST_TOKENS=false`). The script refuses to deploy `TestStablecoin` on chainId 1. Remember the licensing note in the build notes: the Sera.cx-hosted demo stays on a testnet.
