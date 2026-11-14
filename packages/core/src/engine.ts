/**
 * The pay run engine. Pure functions over an EngineContext.
 * Mirrors runInfo/lines/legsFor/totals/pathSteps/rateLine/buildRecord in the prototype.
 */
import { ASSET, LOCAL, RAIL, assetOf, ccyOf, isBank, type Fiat, type PayoutOption, type Stablecoin } from './currencies.js';
import { D, Decimal, conv, crossRate, round, fixed } from './money.js';
import { runInfo } from './schedule.js';
import { PAYOUT_STAGES, type EngineContext, type FundingState, type LineKind, type PayoutStage, type Person } from './types.js';

export interface Leg {
  option: PayoutOption;
  sharePercent: number;
  /** Rounded to the payout currency's decimals. */
  amount: Decimal;
  /** Blocking issue text, or null. Blocking issues stop the whole run. */
  issue: string | null;
  /** Screening flag. Not blocking: the payout is held and the run proceeds. */
  flagged: boolean;
}

export interface Line {
  person: Person;
  kind: LineKind;
  currency: Fiat;
  gross: Decimal;
  deduction: Decimal;
  net: Decimal;
  skipped: boolean;
  oneOffId: string | null;
  legs: Leg[];
}

export function isFlaggedPattern(address: string | null): boolean {
  return !!address && /^0x(dead|bad)/i.test(address);
}

/** Every payout leg for one person: primary and optional secondary split. */
export function legsFor(ctx: EngineContext, p: Person, net: Decimal, currency: Fiat): Leg[] {
  const parts: { option: PayoutOption; pct: number }[] = [
    { option: p.payoutPrimary, pct: p.payoutSecondary ? p.splitPercent : 100 },
  ];
  if (p.payoutSecondary) parts.push({ option: p.payoutSecondary, pct: 100 - p.splitPercent });
  return parts.map(({ option, pct }) => {
    const c = ccyOf(option);
    const bank = isBank(option);
    let amount = conv(net.mul(pct).div(100), currency, c, ctx.rates);
    if (ctx.settings.gasPayer === 'employee') amount = amount.minus(D(ctx.networkFeeUsd).mul(ctx.rates[c]));
    amount = round(amount, c);
    let issue: string | null = null;
    if (bank) {
      if (!ctx.ramps[c].offRamp) issue = `No off-ramp partner connected for ${c}.`;
      else if (!p.kycVerified) issue = 'Not yet verified with the off-ramp partner. The employee does this in their view.';
    } else if (!p.wallet.address) {
      issue = 'No wallet address on file. Enter one under Employees, or the employee can sign theirs.';
    } else if (ctx.settings.requireTestPayment && !p.wallet.tested) {
      issue = 'Test payment not done for this address yet.';
    }
    const flagged = !bank && !!p.wallet.address && (p.wallet.screening === 'flagged' || isFlaggedPattern(p.wallet.address));
    return { option, sharePercent: pct, amount, issue, flagged };
  });
}

/** Run lines: a salary line per person plus every one-off. Deductions apply to employee salary lines only. */
export function lines(ctx: EngineContext): Line[] {
  const frac = runInfo(ctx.settings.schedule, ctx.run.idx).frac;
  const out: Line[] = [];
  for (const p of ctx.people) {
    out.push({ person: p, kind: 'Salary', currency: p.currency, gross: D(p.monthlyPay).mul(frac), deduction: D(0), net: D(0), skipped: ctx.run.skipped.includes(p.id), oneOffId: null, legs: [] });
  }
  for (const x of ctx.run.oneOffs) {
    const p = ctx.people.find((e) => e.id === x.personId);
    if (p) out.push({ person: p, kind: x.kind, currency: x.currency, gross: D(x.amount), deduction: D(0), net: D(0), skipped: false, oneOffId: x.id, legs: [] });
  }
  for (const l of out) {
    const pluginOn = !!ctx.plugins[l.currency];
    l.deduction = l.kind === 'Salary' && l.person.type === 'Employee' && pluginOn ? round(l.gross.mul(ctx.pluginRate), l.currency) : D(0);
    l.net = l.gross.minus(l.deduction);
    l.legs = l.skipped ? [] : legsFor(ctx, l.person, l.net, l.currency);
  }
  return out;
}

export interface Totals {
  fundingCurrency: Fiat;
  fundingAsset: Stablecoin;
  payouts: Decimal;
  count: number;
  swaps: number;
  toBank: number;
  toWallet: number;
  issues: number;
  held: number;
  fee: Decimal;
  gas: Decimal;
  need: Decimal;
  funding: FundingState;
  ready: boolean;
  canSend: boolean;
}

export function fundingAsset(fund: PayoutOption): Stablecoin {
  return assetOf(fund);
}

export function totals(ctx: EngineContext, computed?: Line[]): Totals {
  const fund = ctx.run.fundingSource;
  const fc = ccyOf(fund);
  const src = fundingAsset(fund);
  let payouts = D(0), count = 0, swaps = 0, toBank = 0, toWallet = 0, issues = 0, held = 0;
  for (const l of computed ?? lines(ctx)) {
    for (const g of l.legs) {
      if (g.issue) { issues++; continue; }
      if (g.flagged) { held++; continue; }
      payouts = payouts.plus(conv(g.amount, ccyOf(g.option), fc, ctx.rates));
      count++;
      if (assetOf(g.option) !== src) swaps++;
      if (isBank(g.option)) toBank++; else toWallet++;
    }
  }
  const fee = payouts.mul(ctx.settings.feePercent).div(100);
  const gas = ctx.settings.gasPayer === 'employer' ? D(ctx.networkFeeUsd).mul(count).mul(ctx.rates[fc]) : D(0);
  const need = round(payouts.plus(fee).plus(gas), fc);
  let funding: FundingState;
  if (isBank(fund)) {
    const rampOk = ctx.ramps[fc].onRamp;
    funding = { kind: 'bank', rampOk, funded: ctx.run.funded, ok: rampOk && ctx.run.funded };
  } else {
    const balance = D(ctx.balances[fund] ?? '0');
    const shortBy = Decimal.max(0, need.minus(balance));
    funding = { kind: 'wallet', balance: fixed(balance, fc), shortBy: fixed(shortBy, fc), ok: shortBy.lte(0) };
  }
  const ready = issues === 0 && count > 0;
  return { fundingCurrency: fc, fundingAsset: src, payouts: round(payouts, fc), count, swaps, toBank, toWallet, issues, held, fee: round(fee, fc), gas: round(gas, fc), need, funding, ready, canSend: ready && funding.ok };
}

export interface PathStep { label: string; sera?: boolean }

/** The route a payout takes. Swap on Sera.cx only when the funding stablecoin differs from the payout stablecoin. */
export function pathSteps(fund: PayoutOption, option: PayoutOption): PathStep[] {
  const steps: PathStep[] = [];
  const fc = ccyOf(fund);
  const src = assetOf(fund);
  if (isBank(fund)) steps.push({ label: `Bank ${fc}` }, { label: 'On-ramp partner' });
  steps.push({ label: src });
  const dst = assetOf(option);
  if (src !== dst) steps.push({ label: 'Sera.cx swap', sera: true }, { label: dst });
  if (isBank(option)) steps.push({ label: 'Off-ramp partner' }, { label: RAIL[ccyOf(option)] });
  else steps.push({ label: 'Wallet' });
  return steps;
}

export function needsSwap(fund: PayoutOption, option: PayoutOption): boolean {
  return assetOf(fund) !== assetOf(option);
}

/** "1 USDT = 4.2000 MYRT" or "No swap needed". */
export function rateLine(fund: PayoutOption, option: PayoutOption, rates: Record<Fiat, string>): string {
  const src = assetOf(fund), dst = assetOf(option);
  if (src === dst) return 'No swap needed';
  const r = crossRate(ASSET[src], ASSET[dst], rates);
  return `1 ${src} = ${r.toFixed(4)} ${dst}`;
}

/** Stages a payout passes through, in order. */
export function stagesFor(fund: PayoutOption, option: PayoutOption): PayoutStage[] {
  const st: PayoutStage[] = [PAYOUT_STAGES.screened];
  if (needsSwap(fund, option)) st.push(PAYOUT_STAGES.swapped);
  if (isBank(option)) st.push(PAYOUT_STAGES.sentRamp, PAYOUT_STAGES.arrived);
  else st.push(PAYOUT_STAGES.sentWallet);
  return st;
}

export { LOCAL, RAIL, ASSET };
