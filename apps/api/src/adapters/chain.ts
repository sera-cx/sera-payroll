import type { Address, Hex } from 'viem';
import type { ChainAdapter, DisburseLeg, DisburseResult, Network, PayslipAnchorInput, PayslipAnchorResult, Stablecoin, TokenBalance } from '@sera-payroll/core';
import { fakeTxHash } from '../ids.js';
import type { Config } from '../config.js';

const SEPOLIA_TOKENS: Record<Stablecoin, Address> = {
  USDC: '0x965d4b4546716e416e950bc30467d128455d2d0e', USDT: '0x8365421d0e1b316fc6398d21be162992216bf2ad', MYRT: '0x66d3b49b587b970b5835751708136adb805f1fe4',
  XSGD: '0x058e06ca2628165a6cd1e80e4dc82203dc0020aa', IDRT: '0xf295f26f7fe8a5a8a5c15ca56d8d571f891200dc', JPYC: '0x0b2dfe45ca948a5f75e358e4000ed0adf1142150',
};

/** Nothing on chain. Balances come from the client's demo balances, hashes are fake, receipts are instant. */
export class MockChainAdapter implements ChainAdapter {
  readonly network: Network = 'ethereum';
  readonly chainId = 31337;
  private receipts = new Map<string, 'success' | 'reverted'>();
  constructor(private readBalances: (owner: Address) => Promise<Record<string, string>>) {}
  tokenAddress(s: Stablecoin): Address { return SEPOLIA_TOKENS[s]; }
  async balances(owner: Address, stablecoins: Stablecoin[]): Promise<TokenBalance[]> {
    const b = await this.readBalances(owner);
    return stablecoins.map((s) => ({ stablecoin: s, address: this.tokenAddress(s), decimals: 6, balanceRaw: '0', balance: b[s] ?? '0' }));
  }
  async disburse(_runId: string, legs: DisburseLeg[]): Promise<DisburseResult> {
    const txHash = fakeTxHash();
    this.receipts.set(txHash, 'success');
    return { txHash, legs: legs.map((l) => ({ payoutId: l.payoutId, ok: true, reason: null })) };
  }
  async anchorPayslip(input: PayslipAnchorInput): Promise<PayslipAnchorResult> {
    const txHash = fakeTxHash();
    this.receipts.set(txHash, 'success');
    return { txHash, anchorId: input.root };
  }
  async waitForReceipt(txHash: Hex) { return { status: this.receipts.get(txHash) ?? 'success', blockNumber: 0n } as const; }
  explorerTxUrl(txHash: Hex): string { return `https://sepolia.etherscan.io/tx/${txHash}`; }
}

/**
 * CHAIN=sepolia loads @sera-payroll/chain (built alongside this package). Until that package
 * exists at install time it is loaded dynamically so the API still builds without it.
 */
/** The real adapter plus the calldata builder the approve route puts into `chainPlan.disburse`. */
export type AppChainAdapter = ChainAdapter & { encodeDisburse?: (runId: string, legs: DisburseLeg[]) => { to: Address; data: Hex; value: string } | null };

export async function createChainAdapter(cfg: Config, readDemoBalances: (owner: Address) => Promise<Record<string, string>>): Promise<AppChainAdapter> {
  if (cfg.CHAIN === 'sepolia' || cfg.CHAIN === 'ethereum') {
    if (!cfg.RPC_URL || !cfg.PAYROLL_DISBURSER_ADDRESS || !cfg.PAYSLIP_REGISTRY_ADDRESS) {
      throw new Error(`CHAIN=${cfg.CHAIN} needs RPC_URL, PAYROLL_DISBURSER_ADDRESS and PAYSLIP_REGISTRY_ADDRESS.`);
    }
    // Loaded on demand so the mock path never touches an RPC.
    const mod = await import('@sera-payroll/chain');
    const adapter = mod.createChainAdapter({
      network: cfg.CHAIN, rpcUrl: cfg.RPC_URL,
      disburserAddress: cfg.PAYROLL_DISBURSER_ADDRESS as Address, payslipRegistryAddress: cfg.PAYSLIP_REGISTRY_ADDRESS as Address,
    });
    const withEncoder: AppChainAdapter = Object.assign(adapter, {
      encodeDisburse(runId: string, legs: DisburseLeg[]) {
        if (!legs.length) return null;
        const raw = mod.toRawLegs(legs, (s) => adapter.tokenAddress(s), (s) => adapter.tokenInfo(s).decimals);
        return { to: adapter.disburserAddress, data: mod.encodeDisburse(runId, raw, true), value: '0' };
      },
    });
    return withEncoder;
  }
  return new MockChainAdapter(readDemoBalances);
}

export { SEPOLIA_TOKENS };
