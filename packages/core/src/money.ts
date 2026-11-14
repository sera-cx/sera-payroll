/**
 * Decimal money maths. Never floating point.
 *
 * Rounding rule (section 6 of the build notes asked for one):
 *  - Conversions are carried at full precision (Decimal, 40 significant digits).
 *  - A payout amount is rounded HALF UP to the payout currency's decimal places
 *    once, after conversion and after any employee-paid network fee.
 *  - Employer totals are sums of those rounded payouts converted back to the
 *    funding currency, with the fee and gas added, rounded HALF UP to the
 *    funding currency's decimal places at the end.
 */
import Decimal from 'decimal.js';
import { dp, type Fiat, type RateTable } from './currencies.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type Num = Decimal.Value;

export const D = (v: Num): Decimal => new Decimal(v);

export function round(n: Num, c: Fiat): Decimal {
  return D(n).toDecimalPlaces(dp(c), Decimal.ROUND_HALF_UP);
}

/** Convert between fiat units using a rate table of units per USD. */
export function conv(n: Num, from: Fiat, to: Fiat, rates: RateTable): Decimal {
  if (from === to) return D(n);
  return D(n).div(rates[from]).mul(rates[to]);
}

/** Price of one unit of `from` in `to`, as a Decimal, from a units-per-USD table. */
export function crossRate(from: Fiat, to: Fiat, rates: RateTable): Decimal {
  return D(rates[to]).div(rates[from]);
}

const grouping = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Format with en-GB grouping and the currency's decimal places. Input may be unrounded. */
export function num(n: Num, c: Fiat): string {
  const r = round(n, c);
  const places = dp(c);
  const neg = r.isNegative();
  const abs = r.abs();
  const whole = abs.floor();
  const frac = abs.minus(whole);
  const wholeStr = grouping.format(Number(whole.toFixed(0)));
  const fracStr = places ? '.' + frac.toFixed(places).slice(2) : '';
  return (neg ? '-' : '') + wholeStr + fracStr;
}

export function fixed(n: Num, c: Fiat): string {
  return round(n, c).toFixed(dp(c));
}
