import { SAMPLE_RATES, ASSET, crossRate, D, type IntentSigner, type Network, type SettlementLeg, type SettlementResult, type Stablecoin, type SwapProvider, type SwapRate } from '@sera-payroll/core';
import { fakeTxHash } from '../ids.js';

/** Fixed sample rates, instant settlement, fake hashes. For the demo and tests only. */
export class SampleRateSwapProvider implements SwapProvider {
  readonly name = 'sample-rates';
  private done = new Map<string, SettlementResult>();
  constructor(private rates: Record<string, string> = SAMPLE_RATES) {}
  async getRate(from: Stablecoin, to: Stablecoin, amountIn: string, network: Network): Promise<SwapRate> {
    const r = crossRate(ASSET[from], ASSET[to], this.rates as never);
    return { from, to, amountIn, amountOut: D(amountIn).mul(r).toFixed(6), rate: r.toString(), reference: `sample-${Date.now()}`, validUntil: new Date(Date.now() + 30_000), network };
  }
  async settle(legs: SettlementLeg[], _signer: IntentSigner, _network: Network, _key: string): Promise<SettlementResult[]> {
    return legs.map((l) => {
      const prev = this.done.get(l.payoutId);
      if (prev) return prev;
      const res: SettlementResult = { payoutId: l.payoutId, status: 'settled', txHash: fakeTxHash(), amountOut: l.minAmountOut, reason: null };
      this.done.set(l.payoutId, res);
      return res;
    });
  }
  async getStatus(payoutId: string): Promise<SettlementResult | null> { return this.done.get(payoutId) ?? null; }
}
