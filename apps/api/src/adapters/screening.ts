import type { Address } from 'viem';
import { patternScreening, type Network, type ScreeningProvider, type ScreeningResult } from '@sera-payroll/core';

/** Chainalysis public sanctions screening. Falls back to the demo pattern rule when the service is unavailable. */
export class ChainalysisSanctionsScreening implements ScreeningProvider {
  readonly name = 'chainalysis-sanctions';
  constructor(private apiKey: string, private f: typeof fetch = globalThis.fetch) {}
  async screen(address: Address, network: Network): Promise<ScreeningResult> {
    const demo = await patternScreening.screen(address, network);
    if (demo.status === 'flagged') return demo;
    try {
      const res = await this.f(`https://public.chainalysis.com/api/v1/address/${address}`, { headers: { 'X-API-Key': this.apiKey, accept: 'application/json' } });
      if (!res.ok) return { status: 'clear', reason: `Screening service returned ${res.status}; pattern rule only`, provider: this.name, at: new Date() };
      const body = (await res.json()) as { identifications?: { category?: string; name?: string }[] };
      const hit = body.identifications?.[0];
      return hit ? { status: 'flagged', reason: `${hit.category ?? 'sanctions'}: ${hit.name ?? 'listed address'}`, provider: this.name, at: new Date() } : { status: 'clear', reason: null, provider: this.name, at: new Date() };
    } catch (e) {
      return { status: 'clear', reason: `Screening service unavailable (${e instanceof Error ? e.message : e}); pattern rule only`, provider: this.name, at: new Date() };
    }
  }
}

export { patternScreening };
