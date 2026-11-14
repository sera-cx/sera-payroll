import { createPublicClient, decodeEventLog, decodeErrorResult, hexToString, http, type Address, type Hex, type PublicClient } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import type { ChainAdapter, DisburseLeg, DisburseResult, IntentSigner, PayslipAnchorInput, PayslipAnchorResult, Stablecoin, TokenBalance } from '@sera-payroll/core';
import { PayrollDisburserAbi, PayslipRegistryAbi, erc20Abi } from './abi/index.js';
import { encodeAnchor, encodeDisburse, fromRaw, toRawLegs } from './encoding.js';
import { seraNetwork, seraTokens, type TokenInfo } from './sera.js';

export interface ChainAdapterOptions {
  network: 'sepolia' | 'ethereum';
  rpcUrl: string;
  disburserAddress: Address;
  payslipRegistryAddress: Address;
  /** Override token addresses, for example a self-hosted demo using TestStablecoin. */
  tokens?: Partial<Record<Stablecoin, Address | TokenInfo>>;
  /** Optional pre-built client (tests). */
  client?: PublicClient;
}

type TxSender = { sendTransaction(tx: { to: Address; data: Hex; value?: bigint }): Promise<Hex> };

export function createChainAdapter(opts: ChainAdapterOptions): ChainAdapter & { client: PublicClient; disburserAddress: Address; payslipRegistryAddress: Address; tokenInfo(s: Stablecoin): TokenInfo } {
  const net = seraNetwork(opts.network);
  const chain = opts.network === 'ethereum' ? mainnet : sepolia;
  const client = opts.client ?? createPublicClient({ chain, transport: http(opts.rpcUrl) });
  const base = seraTokens(opts.network);
  const tokens: Record<Stablecoin, TokenInfo> = { ...base };
  for (const [k, v] of Object.entries(opts.tokens ?? {}) as [Stablecoin, Address | TokenInfo][]) {
    tokens[k] = typeof v === 'string' ? { address: v, decimals: base[k]?.decimals ?? 6 } : v;
  }
  const tokenInfo = (s: Stablecoin): TokenInfo => {
    const t = tokens[s];
    if (!t) throw new Error(`No token address for ${s} on ${opts.network}`);
    return t;
  };

  async function waitForReceipt(txHash: Hex) {
    const r = await client.waitForTransactionReceipt({ hash: txHash });
    return { status: r.status, blockNumber: r.blockNumber, logs: r.logs };
  }

  return {
    client,
    disburserAddress: opts.disburserAddress,
    payslipRegistryAddress: opts.payslipRegistryAddress,
    network: opts.network,
    chainId: net.chainId,
    tokenInfo,
    tokenAddress: (s) => tokenInfo(s).address,

    async balances(owner: Address, stablecoins: Stablecoin[]): Promise<TokenBalance[]> {
      const contracts = stablecoins.flatMap((s) => [
        { address: tokenInfo(s).address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [owner] as const },
        { address: tokenInfo(s).address, abi: erc20Abi, functionName: 'decimals' as const },
      ]);
      type R = { status: 'success'; result: unknown } | { status: 'failure'; error: Error };
      let res: R[];
      if (client.chain?.contracts?.multicall3) {
        res = (await client.multicall({ contracts, allowFailure: true })) as R[];
      } else {
        // Local chains without Multicall3: read one by one.
        res = await Promise.all(contracts.map(async (c) => {
          try { return { status: 'success' as const, result: await client.readContract(c as never) }; } catch (error) { return { status: 'failure' as const, error: error as Error }; }
        }));
      }
      return stablecoins.map((s, i) => {
        const bal = res[i * 2];
        const dec = res[i * 2 + 1];
        const decimals = dec?.status === 'success' ? Number(dec.result) : tokenInfo(s).decimals;
        const raw = bal?.status === 'success' ? (bal.result as bigint) : 0n;
        return { stablecoin: s, address: tokenInfo(s).address, decimals, balanceRaw: raw.toString(), balance: fromRaw(raw, decimals) };
      });
    },

    async disburse(runId: string, legs: DisburseLeg[], signer: IntentSigner & TxSender): Promise<DisburseResult> {
      const raw = toRawLegs(legs, (s) => tokenInfo(s).address, (s) => tokenInfo(s).decimals);
      const data = encodeDisburse(runId, raw, true);
      const txHash = await signer.sendTransaction({ to: opts.disburserAddress, data });
      const r = await waitForReceipt(txHash);
      if (r.status !== 'success') return { txHash, legs: legs.map((l) => ({ payoutId: l.payoutId, ok: false, reason: 'transaction reverted' })) };
      const byId = new Map<string, { ok: boolean; reason: string | null }>();
      for (const log of r.logs) {
        if (log.address.toLowerCase() !== opts.disburserAddress.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: PayrollDisburserAbi, data: log.data, topics: log.topics });
          const id = (ev.args as { payoutId?: Hex }).payoutId?.toLowerCase();
          if (!id) continue;
          if (ev.eventName === 'LegPaid') byId.set(id, { ok: true, reason: null });
          else if (ev.eventName === 'LegSkipped') byId.set(id, { ok: true, reason: 'already paid in an earlier transaction' });
          else if (ev.eventName === 'LegFailed') byId.set(id, { ok: false, reason: decodeRevertReason((ev.args as { reason: Hex }).reason) });
        } catch { /* not one of ours */ }
      }
      return {
        txHash,
        legs: raw.map((l, i) => ({ payoutId: legs[i]!.payoutId, ...(byId.get(l.payoutId.toLowerCase()) ?? { ok: false, reason: 'no event emitted for this leg' }) })),
      };
    },

    async anchorPayslip(input: PayslipAnchorInput, signer: TxSender): Promise<PayslipAnchorResult> {
      const data = encodeAnchor(input);
      const txHash = await signer.sendTransaction({ to: opts.payslipRegistryAddress, data });
      const r = await waitForReceipt(txHash);
      if (r.status !== 'success') throw new Error(`Payslip anchor reverted in ${txHash}`);
      for (const log of r.logs) {
        if (log.address.toLowerCase() !== opts.payslipRegistryAddress.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: PayslipRegistryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === 'PayslipAnchored' || ev.eventName === 'PayslipCorrected') return { txHash, anchorId: (ev.args as { anchorId: Hex }).anchorId };
        } catch { /* skip */ }
      }
      throw new Error(`No PayslipAnchored event in ${txHash}`);
    },

    async waitForReceipt(txHash: Hex) {
      const r = await waitForReceipt(txHash);
      return { status: r.status, blockNumber: r.blockNumber };
    },

    explorerTxUrl: (txHash: Hex) => `${net.explorer}/tx/${txHash}`,
  };
}

/** Read an ERC-20 allowance. */
export async function allowance(client: PublicClient, token: Address, owner: Address, spender: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
}

/** Decode `Error(string)` revert data into text, else return a hex snippet. */
export function decodeRevertReason(data: Hex): string {
  if (!data || data === '0x') return 'transfer failed';
  if (data.startsWith('0x08c379a0')) {
    try {
      const r = decodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] }], data });
      return String(r.args[0]);
    } catch { /* fall through */ }
  }
  // Plain bytes("...") from the disburser itself
  try {
    const txt = hexToString(data);
    if (/^[\x20-\x7e]+$/.test(txt)) return txt;
  } catch { /* ignore */ }
  return data.length > 20 ? data.slice(0, 18) + '…' : data;
}
