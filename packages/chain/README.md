# @sera-payroll/chain

On-chain side of Sera.cx Payroll: a `ChainAdapter` (see `@sera-payroll/core`) over the Foundry contracts in `../../contracts`, plus Sera.cx network constants and EIP-712 helpers.

```ts
import { createChainAdapter } from '@sera-payroll/chain';

const chain = createChainAdapter({
  network: process.env.CHAIN as 'sepolia' | 'ethereum',          // the API's CHAIN variable
  rpcUrl: process.env.RPC_URL!,
  disburserAddress: process.env.PAYROLL_DISBURSER_ADDRESS as `0x${string}`,
  payslipRegistryAddress: process.env.PAYSLIP_REGISTRY_ADDRESS as `0x${string}`,
  // tokens: { USDT: '0x...' }  // optional override, e.g. self-hosted TestStablecoin
});
```

Exports: `createChainAdapter`, `allowance`, `decodeRevertReason`; `SERA_SEPOLIA`, `SERA_MAINNET`, `SEPOLIA_SERA_TOKENS`, `MAINNET_SERA_TOKENS`, `seraIntentDomain`, `SERA_INTENT_TYPES`; `encodeDisburse`, `encodeAnchor`, `toRawLegs`, `toRaw`, `fromRaw`, `runIdBytes32`, `personIdBytes32`, `payoutIdBytes32`, `approveAllowanceCalldata`, `payslipDomain`, `payslipTypedData`, `PAYSLIP_REGISTRY_TYPES`, `PAYRUN_APPROVAL_TYPES`, `payRunApprovalDomain`; ABIs and bytecode `PayrollDisburserAbi`, `PayslipRegistryAbi`, `TestStablecoinAbi`, `erc20Abi`.

`pnpm abis` regenerates `src/abi/*.ts` from `contracts/out` after `forge build`. `pnpm test` runs an anvil end-to-end suite when `anvil` is installed and skips it otherwise.
