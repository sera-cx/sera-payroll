import { SYM, ccyOf, isBank, num, optLabel, type Fiat, type PayoutOption } from '@sera-payroll/core';

export const fiat = (n: string | number, c: Fiat) => `${SYM[c]} ${num(n, c)}`;
export const money = (n: string | number, o: PayoutOption) => { const c = ccyOf(o); return isBank(o) ? `${SYM[c]} ${num(n, c)}` : `${num(n, c)} ${o}`; };
export const fundLabel = (o: PayoutOption) => (isBank(o) ? `${ccyOf(o)} by bank transfer` : o);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export { optLabel };

export async function copyText(text: string, label: string, toast: (m: string) => void) {
  try { await navigator.clipboard.writeText(text); toast(`${label} copied`); }
  catch { toast('Copy was blocked. Select the text and copy it by hand.'); }
}

export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
