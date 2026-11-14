import { describe, expect, it } from 'vitest';
import { decodeFunctionData, keccak256, toHex, hashTypedData, recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PayrollDisburserAbi, PayslipRegistryAbi, encodeAnchor, encodeDisburse, toRawLegs, toRaw, fromRaw, runIdBytes32, payoutIdBytes32, payslipTypedData, approveAllowanceCalldata, erc20Abi, SEPOLIA_SERA_TOKENS, SERA_SEPOLIA, seraIntentDomain, SERA_INTENT_TYPES } from '../src/index.js';
import { decodeRevertReason } from '../src/adapter.js';

describe('encoding', () => {
  it('raw amounts', () => {
    expect(toRaw('8500.00', 6)).toBe(8_500_000_000n);
    expect(toRaw('15000000', 2)).toBe(1_500_000_000n);
    expect(fromRaw(1_234_560n, 6)).toBe('1.23456');
  });
  it('disburse calldata round-trips', () => {
    const legs = toRawLegs(
      [{ payoutId: 'po-1', stablecoin: 'MYRT', to: '0x71C2a4b9E05d3F8a61B7c0D2e94F5a3B8c6D9c4E', amount: '8500.00' }],
      (s) => SEPOLIA_SERA_TOKENS[s].address, (s) => SEPOLIA_SERA_TOKENS[s].decimals,
    );
    const data = encodeDisburse('run-1', legs, true);
    const dec = decodeFunctionData({ abi: PayrollDisburserAbi, data });
    expect(dec.functionName).toBe('disburse');
    expect(dec.args[0]).toBe(runIdBytes32('run-1'));
    expect(dec.args[0]).toBe(keccak256(toHex('run-1')));
    expect((dec.args[1] as { payoutId: string }[])[0]!.payoutId).toBe(payoutIdBytes32('po-1'));
    expect((dec.args[1] as { amount: bigint }[])[0]!.amount).toBe(8_500_000_000n);
    expect(dec.args[2]).toBe(true);
  });
  it('anchor calldata and typed data recover the same signer', async () => {
    const acct = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const root = keccak256(toHex('root'));
    const docHash = keccak256(toHex('doc'));
    const td = payslipTypedData({ chainId: 11155111, registry: '0x0000000000000000000000000000000000000001', runId: 'run-1', personId: 'p1', payday: new Date('2026-11-28T00:00:00Z'), root, docHash });
    const sig = await acct.signTypedData(td);
    expect(await recoverTypedDataAddress({ ...td, signature: sig })).toBe(acct.address);
    expect(hashTypedData(td)).toMatch(/^0x[0-9a-f]{64}$/);
    const data = encodeAnchor({ runId: 'run-1', personId: 'p1', payday: new Date('2026-11-28T00:00:00Z'), root, docHash, employerSignature: sig });
    const dec = decodeFunctionData({ abi: PayslipRegistryAbi, data });
    expect(dec.functionName).toBe('anchor');
    expect(dec.args[2]).toBe(1_795_824_000n);
    expect(dec.args[5]).toBe(sig);
  });
  it('approve calldata', () => {
    const dec = decodeFunctionData({ abi: erc20Abi, data: approveAllowanceCalldata('0x0000000000000000000000000000000000000002', 5n) });
    expect(dec.functionName).toBe('approve');
    expect(dec.args[1]).toBe(5n);
  });
  it('sera intent domain shape', () => {
    expect(seraIntentDomain(SERA_SEPOLIA)).toEqual({ name: 'Sera', version: '1', chainId: 11155111, verifyingContract: SERA_SEPOLIA.sera });
    expect(SERA_INTENT_TYPES.Intent.map((f) => f.name).join(',')).toBe('taker,inputToken,outputToken,maxInputAmount,minOutputAmount,recipient,initialDepositAmount,uuid,deadline');
  });
  it('revert reasons', () => {
    expect(decodeRevertReason('0x')).toBe('transfer failed');
    expect(decodeRevertReason(toHex('transferFrom returned false'))).toBe('transferFrom returned false');
    expect(decodeRevertReason('0x08c379a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000005' + toHex('hello').slice(2).padEnd(64, '0') as `0x${string}`)).toBe('hello');
  });
});
