import { describe, expect, it } from 'vitest';
import { lines, totals, pathSteps, rateLine, stagesFor } from './engine.js';
import { sampleContext } from './sample.js';
import { runInfo } from './schedule.js';
import { buildRecord } from './run.js';

/**
 * The prototype's floating-point maths, reproduced here so the decimal engine
 * can be checked against it for the same inputs (build order step 3, "done when").
 */
const RATE: Record<string, number> = { USD: 1, MYR: 4.2, SGD: 1.3, IDR: 16500, JPY: 150 };
const conv = (n: number, f: string, t: string) => (n / RATE[f]!) * RATE[t]!;

describe('engine matches the prototype for the sample client', () => {
  it('totals for Sample Studio funded in USDT', () => {
    const ctx = sampleContext(0);
    const t = totals(ctx);
    // Prototype: Aisyah 8500 MYR→MYRT, Tan 6200 SGD→bank (ok), Nurul 70% bank:MYR + 30% USDT, Daniel 4000 USDC,
    // Putri IDRT with no address → issue.
    const pay = conv(8500, 'MYR', 'USD') + conv(6200, 'SGD', 'USD') + 6000 * 0.7 / 4.2 + 6000 * 0.3 / 4.2 + 4000;
    const n = 5;
    const fee = pay * 0.5 / 100;
    const gas = n * 0.2;
    expect(t.count).toBe(5);
    expect(t.issues).toBe(1);
    expect(t.swaps).toBe(4); // MYRT, XSGD(bank SGD), MYRT(bank MYR), USDC. USDT leg needs none.
    expect(t.toBank).toBe(2);
    expect(t.toWallet).toBe(3);
    expect(Math.abs(t.payouts.toNumber() - pay)).toBeLessThan(0.02);
    expect(Math.abs(t.fee.toNumber() - fee)).toBeLessThan(0.01);
    expect(t.gas.toNumber()).toBeCloseTo(gas, 2);
    expect(Math.abs(t.need.toNumber() - (pay + fee + gas))).toBeLessThan(0.03);
    expect(t.ready).toBe(false); // Putri blocks the run
    expect(t.funding.kind).toBe('wallet');
  });

  it('becomes ready when the blocking person is skipped, and funding passes', () => {
    const ctx = sampleContext(0);
    ctx.run.skipped = ['p5'];
    const t = totals(ctx);
    expect(t.issues).toBe(0);
    expect(t.ready).toBe(true);
    // Sample balance is 12,000 USDT and the run needs a little more, as in the prototype.
    expect(t.canSend).toBe(false);
    expect(t.funding.kind === 'wallet' && Number(t.funding.shortBy) > 0).toBe(true);
    ctx.balances.USDT = '13000';
    expect(totals(ctx).canSend).toBe(true);
  });

  it('a flagged address holds that payout and does not block the run', () => {
    const ctx = sampleContext(0);
    ctx.run.skipped = ['p5'];
    ctx.people[0]!.wallet.address = '0xdead00000000000000000000000000000000beef';
    const t = totals(ctx);
    expect(t.held).toBe(1);
    expect(t.issues).toBe(0);
    expect(t.ready).toBe(true);
    expect(t.count).toBe(4);
  });

  it('employee-paid network fees come off each payout', () => {
    const ctx = sampleContext(0);
    ctx.settings.gasPayer = 'employee';
    const L = lines(ctx);
    const aisyah = L.find((l) => l.person.id === 'p1')!;
    expect(aisyah.legs[0]!.amount.toFixed(2)).toBe((8500 - 0.2 * 4.2).toFixed(2));
    expect(totals(ctx).gas.toNumber()).toBe(0);
  });

  it('statutory plug-in deducts from employee salary lines only', () => {
    const ctx = sampleContext(0);
    ctx.plugins.MYR = true;
    ctx.run.oneOffs.push({ id: 'x1', personId: 'p1', amount: '1000', currency: 'MYR', kind: 'Bonus' });
    const L = lines(ctx);
    const salary = L.find((l) => l.person.id === 'p1' && l.kind === 'Salary')!;
    const bonus = L.find((l) => l.kind === 'Bonus')!;
    expect(salary.deduction.toFixed(2)).toBe('850.00');
    expect(salary.net.toFixed(2)).toBe('7650.00');
    expect(bonus.deduction.toNumber()).toBe(0);
    expect(bonus.net.toFixed(2)).toBe('1000.00');
  });

  it('bank-funded runs need the on-ramp and confirmed funds', () => {
    const ctx = sampleContext(0);
    ctx.run.skipped = ['p5'];
    ctx.run.fundingSource = 'bank:MYR';
    let t = totals(ctx);
    expect(t.funding).toEqual({ kind: 'bank', rampOk: true, funded: false, ok: false });
    expect(t.canSend).toBe(false);
    ctx.run.funded = true;
    t = totals(ctx);
    expect(t.canSend).toBe(true);
    expect(t.fundingCurrency).toBe('MYR');
    // Aisyah MYRT from MYRT funding: no swap.
    expect(rateLine('bank:MYR', 'MYRT', ctx.rates)).toBe('No swap needed');
    expect(pathSteps('bank:MYR', 'USDT').map((s) => s.label)).toEqual(['Bank MYR', 'On-ramp partner', 'MYRT', 'Sera.cx swap', 'USDT', 'Wallet']);
  });

  it('paths, rates and stages', () => {
    expect(pathSteps('USDT', 'bank:MYR').map((s) => s.label)).toEqual(['USDT', 'Sera.cx swap', 'MYRT', 'Off-ramp partner', 'DuitNow']);
    expect(rateLine('USDT', 'MYRT', sampleContext().rates)).toBe('1 USDT = 4.2000 MYRT');
    expect(rateLine('MYRT', 'USDT', sampleContext().rates)).toBe('1 MYRT = 0.2381 USDT');
    expect(stagesFor('USDT', 'bank:MYR')).toEqual(['Screened', 'Swapped on Sera.cx', 'Sent to off-ramp partner', 'Arrived at bank']);
    expect(stagesFor('USDT', 'USDT')).toEqual(['Screened', 'Sent to wallet']);
  });

  it('IDR and JPY round to whole units', () => {
    const ctx = sampleContext(1);
    const arif = lines(ctx).find((l) => l.person.id === 'p102')!;
    // 25,000,000 IDR → USDT
    expect(arif.legs[0]!.amount.toFixed(2)).toBe((25000000 / 16500).toFixed(2));
    const ctx3 = sampleContext(2);
    const hiroshi = lines(ctx3).find((l) => l.person.id === 'p202')!;
    expect(hiroshi.legs[0]!.amount.toString()).toBe('600000');
    expect(hiroshi.legs[0]!.amount.decimalPlaces()).toBe(0);
  });
});

describe('schedules', () => {
  it('monthly, twice monthly and weekly fractions and dates', () => {
    expect(runInfo('Monthly on the 28th', 0).label).toBe('November 2026');
    expect(runInfo('Monthly on the 28th', 0).frac.toNumber()).toBe(1);
    expect(runInfo('Twice a month, 14th and 28th', 0).paydayText).toBe('28 Nov 2026');
    expect(runInfo('Twice a month, 14th and 28th', 1).paydayText).toBe('14 Dec 2026');
    expect(runInfo('Twice a month, 14th and 28th', 1).frac.toNumber()).toBe(0.5);
    expect(runInfo('Weekly on Friday', 0).paydayText).toBe('20 Nov 2026');
    expect(runInfo('Weekly on Friday', 1).paydayText).toBe('27 Nov 2026');
    expect(runInfo('Weekly on Friday', 0).frac.toFixed(6)).toBe((12 / 52).toFixed(6));
  });
});

describe('buildRecord', () => {
  it('snapshots addresses, rates and stages and marks held payouts', () => {
    const ctx = sampleContext(0);
    ctx.run.skipped = ['p5'];
    ctx.people[0]!.wallet.address = '0xbad000000000000000000000000000000000beef';
    const rec = buildRecord(ctx, (p, i) => `${p}-${i}`);
    expect(rec.items).toHaveLength(4);
    const aisyah = rec.items.find((i) => i.personId === 'p1')!;
    expect(aisyah.payouts[0]!.state).toBe('held');
    const nurul = rec.items.find((i) => i.personId === 'p3')!;
    expect(nurul.payouts).toHaveLength(2);
    expect(nurul.payouts[1]!.addressSnapshot).toBe('0x3aF09b1C7d2E4f6A8b0C1d3E5f7A9b2C4d6E8f01');
    expect(nurul.payouts[0]!.stages).toEqual(['Screened', 'Swapped on Sera.cx', 'Sent to off-ramp partner', 'Arrived at bank']);
    expect(rec.count).toBe(4);
    expect(rec.held).toBe(1);
  });
});
