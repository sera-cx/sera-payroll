import type { Fiat } from './currencies.js';
import { D, round } from './money.js';
import type { StatutoryPlugin, StatutoryResult } from './interfaces.js';

/**
 * A SAMPLE plug-in: a flat percentage deduction. Not a real statutory rate.
 * Operators write real country plug-ins against StatutoryPlugin.
 */
export function flatSamplePlugin(country: string, currency: Fiat, rate = '0.10'): StatutoryPlugin {
  return {
    country,
    currency,
    compute(gross, person): StatutoryResult {
      if (person.type !== 'Employee') return { deductions: [], employeeDeduction: '0', net: gross };
      const ded = round(D(gross).mul(rate), currency);
      return { deductions: [{ label: `Sample statutory deduction (${D(rate).mul(100)}%)`, amount: ded.toString(), payer: 'employee' }], employeeDeduction: ded.toString(), net: D(gross).minus(ded).toString() };
    },
  };
}
