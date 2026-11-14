import { encodeFunctionData, getAddress, parseUnits, formatUnits, type Address, type Hex } from 'viem';
import { idToBytes32, type DisburseLeg, type Stablecoin } from '@sera-payroll/core';
import { PayrollDisburserAbi, PayslipRegistryAbi, erc20Abi } from './abi/index.js';

export const runIdBytes32 = (runId: string): Hex => idToBytes32(runId);
export const personIdBytes32 = (personId: string): Hex => idToBytes32(personId);
export const payoutIdBytes32 = (payoutId: string): Hex => idToBytes32(payoutId);

export function toRaw(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}
export function fromRaw(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}

export interface RawLeg { payoutId: Hex; token: Address; to: Address; amount: bigint }

export function toRawLegs(legs: DisburseLeg[], tokenAddress: (s: Stablecoin) => Address, decimalsOf: (s: Stablecoin) => number): RawLeg[] {
  return legs.map((l) => ({ payoutId: payoutIdBytes32(l.payoutId), token: getAddress(tokenAddress(l.stablecoin)), to: getAddress(l.to), amount: toRaw(l.amount, decimalsOf(l.stablecoin)) }));
}

export function encodeDisburse(runId: string, legs: RawLeg[], allowPartial = true): Hex {
  return encodeFunctionData({ abi: PayrollDisburserAbi, functionName: 'disburse', args: [runIdBytes32(runId), legs, allowPartial] });
}

export function encodeAnchor(a: { runId: string; personId: string; payday: Date | number | bigint; root: Hex; docHash: Hex; employerSignature: Hex }): Hex {
  return encodeFunctionData({ abi: PayslipRegistryAbi, functionName: 'anchor', args: [runIdBytes32(a.runId), personIdBytes32(a.personId), paydaySeconds(a.payday), a.root, a.docHash, a.employerSignature] });
}

export function paydaySeconds(payday: Date | number | bigint): bigint {
  if (typeof payday === 'bigint') return payday;
  if (typeof payday === 'number') return BigInt(payday);
  return BigInt(Math.floor(payday.getTime() / 1000));
}

export function approveAllowanceCalldata(spender: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
}

/** Registry EIP-712 domain. Must match PayslipRegistry's constructor: name "Sera.cx Payroll Payslips", version "1". */
export function payslipDomain(chainId: number, registry: Address) {
  return { name: 'Sera.cx Payroll Payslips', version: '1', chainId, verifyingContract: registry } as const;
}

export const PAYSLIP_REGISTRY_TYPES = {
  Payslip: [
    { name: 'runId', type: 'bytes32' },
    { name: 'personId', type: 'bytes32' },
    { name: 'payday', type: 'uint64' },
    { name: 'root', type: 'bytes32' },
    { name: 'docHash', type: 'bytes32' },
  ],
} as const;

/** Typed data the employer signs; the registry recovers `employer` from it. */
export function payslipTypedData(p: { chainId: number; registry: Address; runId: string; personId: string; payday: Date | number | bigint; root: Hex; docHash: Hex }) {
  return {
    domain: payslipDomain(p.chainId, p.registry),
    types: PAYSLIP_REGISTRY_TYPES,
    primaryType: 'Payslip' as const,
    message: { runId: runIdBytes32(p.runId), personId: personIdBytes32(p.personId), payday: paydaySeconds(p.payday), root: p.root, docHash: p.docHash },
  };
}

/** Typed data for the pay run approval. verifyingContract is the PayrollDisburser. */
export const PAYRUN_APPROVAL_TYPES = {
  PayRunApproval: [
    { name: 'runId', type: 'bytes32' },
    { name: 'clientId', type: 'bytes32' },
    { name: 'fundingAsset', type: 'string' },
    { name: 'totalMinor', type: 'uint256' },
    { name: 'payoutCount', type: 'uint32' },
    { name: 'payoutsRoot', type: 'bytes32' },
    { name: 'ratesLockedAt', type: 'uint64' },
  ],
} as const;

export function payRunApprovalDomain(chainId: number, disburser: Address, brand: string) {
  return { name: `${brand} Payroll`, version: '1', chainId, verifyingContract: disburser } as const;
}
