/**
 * Pay schedules. Pay per run = monthly pay × schedule fraction.
 *   Monthly on the 28th        → 1
 *   Twice a month, 14th & 28th → 0.5
 *   Weekly on Friday           → 12/52
 */
import { Decimal } from './money.js';

export const SCHEDULES = ['Monthly on the 28th', 'Twice a month, 14th and 28th', 'Weekly on Friday'] as const;
export type Schedule = (typeof SCHEDULES)[number];

export interface RunInfo {
  label: string;
  payday: Date;
  paydayText: string;
  frac: Decimal;
  per: string;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Default anchor matches the prototype: first run is November 2026. */
export const DEFAULT_ANCHOR = { year: 2026, month: 10 } as const; // month is 0-based

export function runInfo(schedule: Schedule, idx: number, anchor = DEFAULT_ANCHOR): RunInfo {
  if (schedule === 'Weekly on Friday') {
    const d = new Date(Date.UTC(anchor.year, anchor.month, 20 + 7 * idx));
    return { label: 'Week to ' + fmtDate(d), payday: d, paydayText: fmtDate(d), frac: new Decimal(12).div(52), per: 'each run pays 12/52 of monthly pay' };
  }
  if (schedule === 'Twice a month, 14th and 28th') {
    const d = new Date(Date.UTC(anchor.year, anchor.month + Math.floor((idx + 1) / 2), idx % 2 === 0 ? 28 : 14));
    return { label: 'Period to ' + fmtDate(d), payday: d, paydayText: fmtDate(d), frac: new Decimal('0.5'), per: 'each run pays half of monthly pay' };
  }
  const d = new Date(Date.UTC(anchor.year, anchor.month + idx, 28));
  return {
    label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    payday: d, paydayText: fmtDate(d), frac: new Decimal(1), per: '',
  };
}
