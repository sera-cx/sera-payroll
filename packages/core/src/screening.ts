import type { Address } from 'viem';
import type { ScreeningProvider, ScreeningResult } from './interfaces.js';

/** Demo rule: an address starting 0xdead or 0xbad is flagged. Replace with a real provider (Sera.cx KYT/KYA tools are the suggested default). */
export const patternScreening: ScreeningProvider = {
  name: 'pattern-demo',
  async screen(address: Address): Promise<ScreeningResult> {
    const flagged = /^0x(dead|bad)/i.test(address);
    return { status: flagged ? 'flagged' : 'clear', reason: flagged ? 'Address matches the demo deny pattern' : null, provider: 'pattern-demo', at: new Date() };
  },
};
