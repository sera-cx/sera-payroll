/**
 * Sera.cx SwapProvider against the published interface (docs.sera.cx, api-reference):
 *   GET  /config, /tokens, /system/time        (no auth)
 *   POST /swap/quote                             rate with liquidity behind it, lives ~30 s
 *   POST /swap { uuid, signature, permit_* }     settle: EIP-712 Intent signed exactly as route_params
 *   GET  /orders/{trade_id}                      status, needs Authorization: Bearer key:secret
 * Non-custodial: the employer's wallet signs the intent; Sera.cx never holds funds.
 */
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import type { IntentSigner, Network, SettlementLeg, SettlementResult, Stablecoin, SwapProvider, SwapRate } from '@sera-payroll/core';

export const INTENT_TYPES = {
  Intent: [
    { name: 'taker', type: 'address' },
    { name: 'inputToken', type: 'address' },
    { name: 'outputToken', type: 'address' },
    { name: 'maxInputAmount', type: 'uint256' },
    { name: 'minOutputAmount', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'initialDepositAmount', type: 'uint256' },
    { name: 'uuid', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
  ],
} as const;

export interface SeraConfig { chain_id: number; sera_address: Address; vault_address: Address; sor_address: Address }
export interface SeraToken { currency: string; symbol: string; address: Address; decimals: number; min_trade_amount_raw?: string }
export interface SeraRouteParams { taker: Address; inputToken: Address; outputToken: Address; maxInputAmount: string; minOutputAmount: string; recipient: Address; initialDepositAmount: string; uuid: string; deadline: number }
export interface SeraPermit { permit_supported: boolean; permit_required: boolean; token: Address; spender: Address; owner: Address; value_raw: string; nonce: number; suggested_deadline: number; eip712: { domain: Record<string, unknown>; primaryType: 'Permit'; types: Record<string, { name: string; type: string }[]>; message: Record<string, unknown> } }
export interface SeraQuote { uuid: string; route_params: SeraRouteParams; fee_breakdown?: { gas_cost_usd?: string; gas_cost_from_token?: string }; expires_at: number; permit: SeraPermit | null }
export interface SeraOrder { status: 'pending' | 'matched' | 'settled' | 'failed' | 'cancelled'; error_code?: string | null; settlement_summary?: { latest_tx_hash?: string | null; latest_failed_fill_failure_reason?: string | null } | null; settlement_economics?: { gross_credits?: { token: string; amount: string }[] } | null }

export class SeraApiError extends Error {
  constructor(public status: number, public errorCode: string | null, message: string) { super(message); this.name = 'SeraApiError'; }
}

export interface SeraSwapOptions {
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  fetch?: typeof fetch;
  /** Seconds a rate stays settleable from the time it is fetched. */
  expirationSeconds?: number;
}

/** What the browser needs to sign for one leg. Returned on approve as part of the chain plan. */
export interface PreparedIntent {
  payoutId: string;
  uuid: string;
  routeParams: SeraRouteParams;
  domain: { name: 'Sera'; version: '1'; chainId: number; verifyingContract: Address };
  types: typeof INTENT_TYPES;
  permit: SeraPermit | null;
  expiresAt: number;
  amountOut: string;
}

export class SeraSwapProvider implements SwapProvider {
  readonly name = 'sera.cx';
  private cfg: SeraConfig | null = null;
  private tokens: Map<string, SeraToken> | null = null;
  private trades = new Map<string, { tradeId: string; payoutId: string; to: Stablecoin }>();
  private readonly f: typeof fetch;

  constructor(private readonly o: SeraSwapOptions) { this.f = o.fetch ?? globalThis.fetch; }

  private async call<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...(init.headers as Record<string, string> | undefined) };
    if (auth) {
      if (!this.o.apiKey || !this.o.apiSecret) throw new SeraApiError(401, 'NO_API_KEY', 'SERA_API_KEY and SERA_API_SECRET are needed to read order status.');
      headers.authorization = `Bearer ${this.o.apiKey}:${this.o.apiSecret}`;
    }
    const res = await this.f(this.o.baseUrl.replace(/\/$/, '') + path, { ...init, headers, redirect: 'manual' });
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const d = (body as { detail?: unknown } | null)?.detail;
      const inner = typeof d === 'object' && d ? (d as { detail?: string; error_code?: string }) : null;
      throw new SeraApiError(res.status, inner?.error_code ?? (typeof d === 'object' && d && 'code' in d ? String((d as { code: unknown }).code) : null), inner?.detail ?? (typeof d === 'string' ? d : `Sera.cx returned ${res.status}`));
    }
    return body as T;
  }

  async config(): Promise<SeraConfig> {
    if (!this.cfg) this.cfg = await this.call<SeraConfig>('/config');
    return this.cfg;
  }

  async tokenTable(): Promise<Map<string, SeraToken>> {
    if (!this.tokens) {
      const r = await this.call<{ tokens: SeraToken[] }>('/tokens');
      this.tokens = new Map(r.tokens.map((t) => [t.symbol.toUpperCase(), t]));
    }
    return this.tokens;
  }

  async token(sym: Stablecoin): Promise<SeraToken> {
    const t = (await this.tokenTable()).get(sym);
    if (!t) throw new SeraApiError(400, 'UNSUPPORTED_TOKEN', `${sym} is not listed on Sera.cx for this network.`);
    return t;
  }

  async serverTime(): Promise<number> {
    try { return (await this.call<{ timestamp: number }>('/system/time')).timestamp; } catch { return Math.floor(Date.now() / 1000); }
  }

  domain(cfg: SeraConfig) {
    return { name: 'Sera', version: '1', chainId: cfg.chain_id, verifyingContract: cfg.sera_address } as const;
  }

  async quote(from: Stablecoin, to: Stablecoin, amountIn: string, owner: Address, recipient: Address): Promise<SeraQuote> {
    const [tf, tt, now] = await Promise.all([this.token(from), this.token(to), this.serverTime()]);
    const body = {
      from_token: tf.address, to_token: tt.address, from_amount: parseUnits(amountIn, tf.decimals).toString(),
      owner_address: owner.toLowerCase(), recipient, expiration: now + (this.o.expirationSeconds ?? 600), gas_mode: 'receive_less',
    };
    return this.call<SeraQuote>('/swap/quote', { method: 'POST', body: JSON.stringify(body) });
  }

  async getRate(from: Stablecoin, to: Stablecoin, amountIn: string, network: Network, owner: Address = '0x0000000000000000000000000000000000000001', recipient: Address = owner): Promise<SwapRate> {
    const [q, tf, tt] = await Promise.all([this.quote(from, to, amountIn, owner, recipient), this.token(from), this.token(to)]);
    const inAmt = formatUnits(BigInt(q.route_params.maxInputAmount), tf.decimals);
    const out = formatUnits(BigInt(q.route_params.minOutputAmount), tt.decimals);
    if (q.route_params.minOutputAmount === '0') throw new SeraApiError(409, 'NO_LIQUIDITY', `Sera.cx has no settleable route for ${from} to ${to} right now.`);
    const rate = (Number(out) / Number(inAmt)).toString();
    return { from, to, amountIn: inAmt, amountOut: out, rate, reference: q.uuid, validUntil: new Date(q.expires_at * 1000), network };
  }

  /** Rate plus everything the employer's wallet must sign. */
  async prepareIntent(leg: SettlementLeg, owner: Address): Promise<PreparedIntent> {
    const [cfg, q, tt] = await Promise.all([this.config(), this.quote(leg.from, leg.to, leg.amountIn, owner, leg.recipient), this.token(leg.to)]);
    return { payoutId: leg.payoutId, uuid: q.uuid, routeParams: q.route_params, domain: this.domain(cfg), types: INTENT_TYPES, permit: q.permit, expiresAt: q.expires_at, amountOut: formatUnits(BigInt(q.route_params.minOutputAmount), tt.decimals) };
  }

  /** Submit an intent the browser (or a server signer) has signed. */
  async submitSigned(payoutId: string, to: Stablecoin, uuid: string, signature: Hex, permitSignature?: Hex, permitDeadline?: number): Promise<{ tradeId: string }> {
    const body: Record<string, unknown> = { uuid, signature };
    if (permitSignature) { body.permit_signature = permitSignature; body.permit_deadline = permitDeadline; }
    const r = await this.call<{ success: boolean; trade_id: string; status: string }>('/swap', { method: 'POST', body: JSON.stringify(body) });
    this.trades.set(payoutId, { tradeId: r.trade_id, payoutId, to });
    return { tradeId: r.trade_id };
  }

  rememberTrade(payoutId: string, tradeId: string, to: Stablecoin): void { this.trades.set(payoutId, { tradeId, payoutId, to }); }

  /** Server-side settlement with a signer that can sign EIP-712 (treasury hot wallet or multisig front-end). Re-fetches a rate on QUOTE_STALE once. */
  async settle(legs: SettlementLeg[], signer: IntentSigner, _network: Network, _idempotencyKey: string): Promise<SettlementResult[]> {
    const out: SettlementResult[] = [];
    for (const leg of legs) {
      if (this.trades.has(leg.payoutId)) { out.push((await this.getStatus(leg.payoutId))!); continue; }
      let attempt = 0;
      for (;;) {
        attempt++;
        const p = await this.prepareIntent(leg, signer.address);
        try {
          // Same bytes as returned; only the hex casing of addresses is normalised so strict signers accept sample casing.
          const message = Object.fromEntries(Object.entries(p.routeParams).map(([k, v]) => [k, typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : v]));
          const signature = await signer.signTypedData({ domain: p.domain, types: p.types as unknown as Record<string, { name: string; type: string }[]>, primaryType: 'Intent', message });
          let permitSig: Hex | undefined, permitDeadline: number | undefined;
          if (p.permit) {
            const pm = Object.fromEntries(Object.entries(p.permit.eip712.message).map(([k, v]) => [k, typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : v]));
            permitSig = await signer.signTypedData({ domain: p.permit.eip712.domain, types: p.permit.eip712.types, primaryType: 'Permit', message: pm });
            permitDeadline = Number(p.permit.eip712.message.deadline ?? p.permit.suggested_deadline);
          }
          const { tradeId } = await this.submitSigned(leg.payoutId, leg.to, p.uuid, signature, permitSig, permitDeadline);
          out.push({ payoutId: leg.payoutId, status: 'submitted', txHash: null, amountOut: null, reason: tradeId });
          break;
        } catch (e) {
          if (e instanceof SeraApiError && e.status === 409 && e.errorCode === 'QUOTE_STALE' && attempt < 2) continue;
          out.push({ payoutId: leg.payoutId, status: 'failed', txHash: null, amountOut: null, reason: e instanceof Error ? e.message : String(e) });
          break;
        }
      }
    }
    return out;
  }

  async getStatus(payoutId: string): Promise<SettlementResult | null> {
    const t = this.trades.get(payoutId);
    if (!t) return null;
    const o = await this.call<SeraOrder>(`/orders/${encodeURIComponent(t.tradeId)}`, {}, true);
    const tx = (o.settlement_summary?.latest_tx_hash ?? null) as Hex | null;
    if (o.status === 'settled') {
      const tt = await this.token(t.to);
      const credit = o.settlement_economics?.gross_credits?.find((c) => c.token?.toUpperCase() === tt.symbol.toUpperCase());
      return { payoutId, status: 'settled', txHash: tx, amountOut: credit?.amount ?? null, reason: null };
    }
    if (o.status === 'failed' || o.status === 'cancelled') return { payoutId, status: 'failed', txHash: tx, amountOut: null, reason: o.error_code ?? o.settlement_summary?.latest_failed_fill_failure_reason ?? o.status };
    return { payoutId, status: 'submitted', txHash: tx, amountOut: null, reason: null };
  }
}
