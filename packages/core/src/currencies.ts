/**
 * Currencies, stablecoins and the sample reference rates.
 * Every rate here is a SAMPLE. The real build fetches rates from the SwapProvider
 * (Sera.cx by default) at review time and locks them at signing.
 */
export const FIAT = ['USD', 'MYR', 'SGD', 'IDR', 'JPY'] as const;
export type Fiat = (typeof FIAT)[number];

export const STABLECOINS = ['USDT', 'USDC', 'MYRT', 'XSGD', 'IDRT', 'JPYC'] as const;
export type Stablecoin = (typeof STABLECOINS)[number];

/** Which fiat each stablecoin tracks. */
export const ASSET: Record<Stablecoin, Fiat> = {
  USDT: 'USD', USDC: 'USD', MYRT: 'MYR', XSGD: 'SGD', IDRT: 'IDR', JPYC: 'JPY',
};
/** The local stablecoin a fiat payout settles through. */
export const LOCAL: Record<Fiat, Stablecoin> = {
  USD: 'USDC', MYR: 'MYRT', SGD: 'XSGD', IDR: 'IDRT', JPY: 'JPYC',
};
/** Bank rail name per fiat currency, for display. */
export const RAIL: Record<Fiat, string> = {
  USD: 'Bank wire', MYR: 'DuitNow', SGD: 'PayNow', IDR: 'BI-FAST', JPY: 'Bank transfer',
};
export const SYM: Record<Fiat, string> = { USD: 'US$', MYR: 'RM', SGD: 'S$', IDR: 'Rp', JPY: '¥' };

/** Sample reference rates, units of fiat per 1 USD. Replace with live rates. */
export const SAMPLE_RATES: Record<Fiat, string> = {
  USD: '1', MYR: '4.20', SGD: '1.30', IDR: '16500', JPY: '150',
};
export type RateTable = Record<Fiat, string>;

/** Decimal places for a fiat currency and its stablecoin. IDR and JPY use 0. */
export function dp(c: Fiat): number {
  return c === 'IDR' || c === 'JPY' ? 0 : 2;
}

/**
 * A payout option is a stablecoin symbol ("MYRT") or a bank payout in a fiat
 * currency ("bank:MYR"). The same string shape is used for funding sources.
 */
export type PayoutOption = Stablecoin | `bank:${Fiat}`;

export function isBank(o: PayoutOption): o is `bank:${Fiat}` {
  return o.startsWith('bank:');
}
export function ccyOf(o: PayoutOption): Fiat {
  return isBank(o) ? (o.slice(5) as Fiat) : ASSET[o as Stablecoin];
}
/** The stablecoin that actually moves for an option: the coin itself, or the local coin for a bank payout. */
export function assetOf(o: PayoutOption): Stablecoin {
  return isBank(o) ? LOCAL[ccyOf(o)] : (o as Stablecoin);
}
export function optLabel(o: PayoutOption): string {
  return isBank(o) ? `${ccyOf(o)} to bank` : o;
}
export function optSub(o: PayoutOption): string {
  const c = ccyOf(o);
  return isBank(o) ? `${RAIL[c]} via off-ramp partner` : `${c} stablecoin to wallet`;
}
export const PAYOUT_OPTIONS: PayoutOption[] = [
  'MYRT', 'XSGD', 'USDT', 'USDC', 'IDRT', 'JPYC', 'bank:MYR', 'bank:SGD', 'bank:USD', 'bank:IDR',
];
export const FUNDING_OPTIONS: PayoutOption[] = [
  'USDT', 'USDC', 'MYRT', 'XSGD', 'bank:MYR', 'bank:SGD', 'bank:USD',
];
export function isFiat(x: string): x is Fiat {
  return (FIAT as readonly string[]).includes(x);
}
export function isStablecoin(x: string): x is Stablecoin {
  return (STABLECOINS as readonly string[]).includes(x);
}
export function isPayoutOption(x: string): x is PayoutOption {
  return isStablecoin(x) || (x.startsWith('bank:') && isFiat(x.slice(5)));
}
