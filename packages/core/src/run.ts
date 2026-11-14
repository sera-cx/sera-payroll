/**
 * Pay run and payout state machines.
 *   Pay run: draft → submitted (two-person only) → sent → complete. Submitted can go back to draft. Sent cannot be edited.
 *   Payout:  queued → running through stages → done. Side states: failed (retryable), held (screening flag).
 */
import { ccyOf, isBank, optSub, type PayoutOption } from './currencies.js';
import { lines, needsSwap, pathSteps, rateLine, stagesFor, totals, type Line, type Totals } from './engine.js';
import { conv, fixed } from './money.js';
import { runInfo } from './schedule.js';
import type { EngineContext, LineKind, PayoutStage, PayoutState, PersonType, RunStatus } from './types.js';

export class RunRuleError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'RunRuleError'; }
}

export function assertTransition(from: RunStatus, to: RunStatus, twoPerson: boolean): void {
  const ok =
    (from === 'draft' && to === 'submitted' && twoPerson) ||
    (from === 'draft' && to === 'sent' && !twoPerson) ||
    (from === 'submitted' && to === 'draft') ||
    (from === 'submitted' && to === 'sent') ||
    (from === 'sent' && to === 'complete');
  if (!ok) throw new RunRuleError(`A ${from} run cannot move to ${to}.`, 'bad_transition');
}

/** Preparer and approver separation. Enforced on the server, not only in the UI. */
export function assertApprover(preparedBy: string | null, approver: string, twoPerson: boolean): void {
  if (twoPerson && preparedBy && preparedBy === approver) {
    throw new RunRuleError('The preparer cannot approve their own run.', 'same_person');
  }
}

export interface PayoutRecord {
  id: string;
  option: PayoutOption;
  sharePercent: number;
  amount: string;
  amountText: string;
  sub: string;
  lockedRate: string;
  usdValue: string;
  needsSwap: boolean;
  stages: PayoutStage[];
  stageIndex: number;
  state: PayoutState;
  txHash: string | null;
  failureReason: string | null;
  addressSnapshot: string | null;
  networkSnapshot: string | null;
  path: { label: string; sera?: boolean }[];
}

export interface RunItem {
  personId: string;
  name: string;
  type: PersonType;
  kind: LineKind;
  currency: string;
  gross: string;
  deduction: string;
  net: string;
  payouts: PayoutRecord[];
}

export interface RunRecord {
  label: string;
  payday: string;
  fundingSource: PayoutOption;
  need: string;
  fee: string;
  gas: string;
  count: number;
  swaps: number;
  held: number;
  items: RunItem[];
  totals: Totals;
}

/** Snapshot a draft into an immutable record at signing. Addresses and rates freeze here. */
export function buildRecord(ctx: EngineContext, idFor: (personId: string, legIndex: number) => string, computed?: Line[]): RunRecord {
  const L = computed ?? lines(ctx);
  const t = totals(ctx, L);
  const inf = runInfo(ctx.settings.schedule, ctx.run.idx);
  const fund = ctx.run.fundingSource;
  const items: RunItem[] = [];
  for (const l of L) {
    const payouts: PayoutRecord[] = [];
    l.legs.forEach((g, i) => {
      if (g.issue) return;
      const c = ccyOf(g.option);
      const bank = isBank(g.option);
      const rec: PayoutRecord = {
        id: idFor(l.person.id, i),
        option: g.option,
        sharePercent: g.sharePercent,
        amount: fixed(g.amount, c),
        amountText: bank ? `${c} ${fixed(g.amount, c)}` : `${fixed(g.amount, c)} ${g.option}`,
        sub: optSub(g.option) + (bank ? '' : `, ${l.person.wallet.address} on ${l.person.wallet.network}`),
        lockedRate: rateLine(fund, g.option, ctx.rates),
        usdValue: fixed(conv(g.amount, c, 'USD', ctx.rates), 'USD'),
        needsSwap: needsSwap(fund, g.option),
        stages: stagesFor(fund, g.option),
        stageIndex: 0,
        state: 'queued',
        txHash: null,
        failureReason: null,
        addressSnapshot: bank ? null : l.person.wallet.address,
        networkSnapshot: bank ? null : l.person.wallet.network,
        path: pathSteps(fund, g.option),
      };
      if (g.flagged) { rec.state = 'held'; rec.failureReason = 'Address flagged by screening. Payout held, the rest of the run went ahead.'; }
      payouts.push(rec);
    });
    if (payouts.length) items.push({ personId: l.person.id, name: l.person.name, type: l.person.type, kind: l.kind, currency: l.currency, gross: fixed(l.gross, l.currency), deduction: fixed(l.deduction, l.currency), net: fixed(l.net, l.currency), payouts });
  }
  return { label: inf.label, payday: inf.paydayText, fundingSource: fund, need: fixed(t.need, t.fundingCurrency), fee: fixed(t.fee, t.fundingCurrency), gas: fixed(t.gas, t.fundingCurrency), count: t.count, swaps: t.swaps, held: t.held, items, totals: t };
}

/** Advance one payout by one stage. Returns the new payout. Pure. */
export function advancePayout(p: PayoutRecord, txHash: string | null = null): PayoutRecord {
  if (p.state !== 'running' && p.state !== 'queued') return p;
  const next = p.stageIndex + 1;
  if (next >= p.stages.length - 1) return { ...p, stageIndex: p.stages.length - 1, state: 'done', txHash: txHash ?? p.txHash };
  return { ...p, stageIndex: next, state: 'running', txHash: txHash ?? p.txHash };
}

export function failPayout(p: PayoutRecord, reason: string): PayoutRecord {
  return { ...p, state: 'failed', failureReason: reason };
}

/** Retry: only a failed payout, and only back to the start of its stages. Idempotency is the caller's job (see IdempotencyKey in the API). */
export function retryPayout(p: PayoutRecord): PayoutRecord {
  if (p.state !== 'failed') throw new RunRuleError('Only a failed payout can be retried.', 'not_failed');
  return { ...p, state: 'queued', stageIndex: 0, failureReason: null };
}

export function recordStatus(r: { items: { payouts: { state: PayoutState }[] }[] }): string {
  let running = 0, failed = 0, held = 0;
  for (const i of r.items) for (const g of i.payouts) {
    if (g.state === 'running' || g.state === 'queued') running++;
    if (g.state === 'failed') failed++;
    if (g.state === 'held') held++;
  }
  return running ? 'In progress' : failed ? `${failed} failed` : held ? `Complete, ${held} held` : 'Complete';
}

export function isComplete(r: { items: { payouts: { state: PayoutState }[] }[] }): boolean {
  return r.items.every((i) => i.payouts.every((g) => g.state === 'done' || g.state === 'held' || g.state === 'failed')) && !r.items.some((i) => i.payouts.some((g) => g.state === 'failed'));
}
