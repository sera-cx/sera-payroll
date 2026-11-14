/**
 * End-to-end against a local anvil: deploy the three contracts from the compiled bytecode,
 * fund a treasury, approve the disburser, disburse (one leg failing), retry, anchor a payslip,
 * and verify a disclosed field on chain. Skipped when anvil is not installed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { disclose, sealPayslip, leafHash, type PayslipDocument } from '@sera-payroll/core';
import { createChainAdapter, PayrollDisburserAbi, PayrollDisburserBytecode, PayslipRegistryAbi, PayslipRegistryBytecode, TestStablecoinAbi, TestStablecoinBytecode, erc20Abi, payslipTypedData, allowance, runIdBytes32, personIdBytes32 } from '../src/index.js';

const anvilBin = [`${homedir()}/.foundry/bin/anvil`, '/usr/local/bin/anvil', '/opt/homebrew/bin/anvil'].find(existsSync);
const PORT = 8599;
const RPC = `http://127.0.0.1:${PORT}`;
// anvil default accounts
const treasury = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const relayer = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const alice: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const bob: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

describe.skipIf(!anvilBin)('anvil end to end', () => {
  let proc: ChildProcess;
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
  const tw = createWalletClient({ account: treasury, chain: foundry, transport: http(RPC) });
  const rw = createWalletClient({ account: relayer, chain: foundry, transport: http(RPC) });
  let disburser: Address, registry: Address, tUSDT: Address, tMYRT: Address;

  async function deploy(abi: any, bytecode: Hex, args: unknown[] = []): Promise<Address> {
    const hash = await tw.deployContract({ abi, bytecode, args });
    const r = await pub.waitForTransactionReceipt({ hash });
    return r.contractAddress!;
  }

  beforeAll(async () => {
    proc = spawn(anvilBin!, ['--port', String(PORT), '--silent']);
    for (let i = 0; i < 50; i++) { try { await pub.getChainId(); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
    disburser = await deploy(PayrollDisburserAbi, PayrollDisburserBytecode as Hex);
    registry = await deploy(PayslipRegistryAbi, PayslipRegistryBytecode as Hex);
    tUSDT = await deploy(TestStablecoinAbi, TestStablecoinBytecode as Hex, ['Test USDT', 'tUSDT', 6, 1_000_000_000n, 3600n]);
    tMYRT = await deploy(TestStablecoinAbi, TestStablecoinBytecode as Hex, ['Test MYRT', 'tMYRT', 6, 1_000_000_000n, 3600n]);
    await pub.waitForTransactionReceipt({ hash: await tw.writeContract({ address: tUSDT, abi: TestStablecoinAbi, functionName: 'faucet' }) });
    await pub.waitForTransactionReceipt({ hash: await tw.writeContract({ address: tMYRT, abi: TestStablecoinAbi, functionName: 'mint', args: [treasury.address, 100_000_000n] }) }); // only 100 MYRT
  });
  afterAll(() => { proc?.kill(); });

  it('balances, approve, disburse with one failing leg, retry pays only the failed leg', async () => {
    const adapter = createChainAdapter({ network: 'sepolia', rpcUrl: RPC, disburserAddress: disburser, payslipRegistryAddress: registry, tokens: { USDT: tUSDT, MYRT: tMYRT }, client: pub as any });
    const bal = await adapter.balances(treasury.address, ['USDT', 'MYRT']);
    expect(bal.find((b) => b.stablecoin === 'USDT')!.balance).toBe('1000');
    expect(bal.find((b) => b.stablecoin === 'MYRT')!.balance).toBe('100');

    for (const t of [tUSDT, tMYRT]) await pub.waitForTransactionReceipt({ hash: await tw.writeContract({ address: t, abi: erc20Abi, functionName: 'approve', args: [disburser, 2n ** 255n] }) });
    expect(await allowance(pub as any, tUSDT, treasury.address, disburser)).toBeGreaterThan(0n);

    const signer = { address: treasury.address, signTypedData: (a: any) => tw.signTypedData({ ...a, account: treasury }), sendTransaction: (tx: { to: Address; data: Hex }) => tw.sendTransaction({ ...tx, account: treasury, chain: foundry }) };
    const legs = [
      { payoutId: 'po-alice', stablecoin: 'USDT' as const, to: alice, amount: '250.50' },
      { payoutId: 'po-bob', stablecoin: 'MYRT' as const, to: bob, amount: '4200.00' }, // treasury has only 100 MYRT
    ];
    const r1 = await adapter.disburse('run-1', legs, signer);
    expect(r1.legs).toEqual([{ payoutId: 'po-alice', ok: true, reason: null }, { payoutId: 'po-bob', ok: false, reason: expect.any(String) }]);
    expect(await pub.readContract({ address: tUSDT, abi: erc20Abi, functionName: 'balanceOf', args: [alice] })).toBe(250_500_000n);
    expect(adapter.explorerTxUrl(r1.txHash)).toContain('sepolia.etherscan.io/tx/');

    await pub.waitForTransactionReceipt({ hash: await tw.writeContract({ address: tMYRT, abi: TestStablecoinAbi, functionName: 'mint', args: [treasury.address, 10_000_000_000n] }) });
    const r2 = await adapter.disburse('run-1', legs, signer);
    expect(r2.legs[0]).toEqual({ payoutId: 'po-alice', ok: true, reason: 'already paid in an earlier transaction' });
    expect(r2.legs[1]).toEqual({ payoutId: 'po-bob', ok: true, reason: null });
    expect(await pub.readContract({ address: tUSDT, abi: erc20Abi, functionName: 'balanceOf', args: [alice] })).toBe(250_500_000n); // not paid twice
    expect(await pub.readContract({ address: tMYRT, abi: erc20Abi, functionName: 'balanceOf', args: [bob] })).toBe(4_200_000_000n);
    expect(await pub.readContract({ address: tUSDT, abi: erc20Abi, functionName: 'balanceOf', args: [disburser] })).toBe(0n);
  });

  it('anchors an employer-signed payslip through a relayer and verifies a disclosed field on chain', async () => {
    const adapter = createChainAdapter({ network: 'sepolia', rpcUrl: RPC, disburserAddress: disburser, payslipRegistryAddress: registry, client: pub as any });
    const doc: PayslipDocument = {
      version: 1, runId: 'run-1', runLabel: 'November 2026', payday: '2026-11-28', employer: treasury.address, employerName: 'Sample Studio Sdn Bhd',
      personId: 'p-alice', personName: 'Alice', personType: 'Employee', kind: 'Salary', currency: 'USD', gross: '250.50', deduction: '0.00', net: '250.50',
      payouts: [{ option: 'USDT', amount: '250.50', lockedRate: 'No swap needed', usdValue: '250.50', txHash: null, address: alice, network: 'sepolia' }],
    };
    let n = 0;
    const sealed = sealPayslip(doc, () => keccak256(toHex(`s${n++}`)));
    const payday = new Date('2026-11-28T00:00:00Z');
    const td = payslipTypedData({ chainId: foundry.id, registry, runId: 'run-1', personId: 'p-alice', payday, root: sealed.root, docHash: sealed.docHash });
    const employerSignature = await tw.signTypedData({ ...td, account: treasury });
    const relaySigner = { sendTransaction: (tx: { to: Address; data: Hex }) => rw.sendTransaction({ ...tx, account: relayer, chain: foundry }) };
    const res = await adapter.anchorPayslip({ runId: 'run-1', personId: 'p-alice', payday, root: sealed.root, docHash: sealed.docHash, employerSignature }, relaySigner);
    const expectedId = keccak256(`0x${runIdBytes32('run-1').slice(2)}${personIdBytes32('p-alice').slice(2)}`);
    expect(res.anchorId).toBe(expectedId);
    const a = await pub.readContract({ address: registry, abi: PayslipRegistryAbi, functionName: 'getAnchor', args: [res.anchorId] });
    expect(a.employer).toBe(treasury.address);
    expect(a.root).toBe(sealed.root);
    const d = disclose(sealed, ['net']);
    const ok = await pub.readContract({ address: registry, abi: PayslipRegistryAbi, functionName: 'verifyField', args: [res.anchorId, leafHash(d.fields[0]!.leaf), d.fields[0]!.proof] });
    expect(ok).toBe(true);
    const bad = await pub.readContract({ address: registry, abi: PayslipRegistryAbi, functionName: 'verifyField', args: [res.anchorId, leafHash({ ...d.fields[0]!.leaf, value: '1.00' }), d.fields[0]!.proof] });
    expect(bad).toBe(false);
  });
});
