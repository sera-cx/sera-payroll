/**
 * Payout worker. Driven entirely by stored state so a restart resumes where it stopped.
 * A payout at stageIndex i in state running is "at" stage i. One tick tries to move it to
 * stage i+1 by performing that stage's action:
 *   Screened                → screen the address (queued → running, or held)
 *   Swapped on Sera.cx      → settle the swap leg (mock: instant; Sera.cx: wait for the signed intent, then poll)
 *   Sent to wallet          → disburse on chain (mock: instant; real: wait for the run's disburse receipt)
 *   Sent to off-ramp partner→ create the bank payout at the partner
 *   Arrived at bank         → poll the partner until arrived
 * Reaching the last stage marks the payout done. Errors mark it failed with a reason; retry
 * requeues it and the same idempotency key per payout keeps settlement and bank payouts from
 * happening twice.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Address, Hex } from 'viem';
import { PAYOUT_STAGES, assetOf, ccyOf, isBank, type Fiat, type PayoutOption, type Stablecoin } from '@sera-payroll/core';
import { payRuns, payouts, people, runLines, type Db } from '@sera-payroll/db';
import type { Deps } from './deps.js';
import { sealLine } from './payslips.js';
import { loadTenant } from './tenancy.js';
import type { PayoutRow } from './runs.js';

export class PayoutWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private deps: Deps) {}

  start(intervalMs = this.deps.config.WORKER_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** One pass over every open payout. Safe to call concurrently; passes do not overlap. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let moved = 0;
    try {
      const open = await this.deps.db.select().from(payouts).where(inArray(payouts.state, ['queued', 'running'])).orderBy(payouts.runId, payouts.position);
      for (const p of open) {
        try { if (await this.step(p)) moved++; }
        catch (e) { await this.fail(p, e instanceof Error ? e.message : String(e)); moved++; }
      }
      for (const runId of new Set(open.map((p) => p.runId))) await this.closeRunIfDone(runId);
    } finally { this.running = false; }
    return moved;
  }

  /** Run ticks until nothing moves. Tests and the demo reset use this. */
  async drain(maxTicks = 50): Promise<void> {
    for (let i = 0; i < maxTicks; i++) { if ((await this.tick()) === 0) { const open = await this.deps.db.select({ id: payouts.id }).from(payouts).where(inArray(payouts.state, ['queued', 'running'])); if (!open.length) return; } }
  }

  private async step(p: PayoutRow): Promise<boolean> {
    const run = (await this.deps.db.select().from(payRuns).where(eq(payRuns.id, p.runId)).limit(1))[0];
    if (!run || (run.status !== 'sent')) return false;
    const t = await loadTenant(this.deps.db, p.clientId);
    const opId = t.operator.id;
    const option = p.option as PayoutOption;
    if (p.state === 'queued') {
      // Stage 0: screen before every payout, not only when the address is added.
      if (p.addressSnapshot) {
        const r = await this.deps.screening.screen(p.addressSnapshot as Address, (p.networkSnapshot ?? 'ethereum') as never);
        if (r.status === 'flagged') {
          await this.set(p.id, { state: 'held', failureReason: `Address flagged by screening (${r.reason ?? 'no reason given'}). Payout held, the rest of the run went ahead.` });
          await this.notifyEmployer(t.client.id, opId, 'payout.held', { label: run.label, personId: p.personId });
          await this.deps.webhooks.emit(opId, 'payout.held', { clientId: p.clientId, runId: p.runId, payoutId: p.id, reason: r.reason });
          return true;
        }
      }
      if (p.willFail) {
        await this.set(p.id, { willFail: false, attempts: p.attempts + 1 });
        await this.fail({ ...p, willFail: false }, 'Network error (simulated). Nothing left the wallet for this payout.');
        return true;
      }
      await this.set(p.id, { state: 'running', stageIndex: 0, attempts: p.attempts + 1 });
      await this.deps.webhooks.emit(opId, 'payout.screened', { clientId: p.clientId, runId: p.runId, payoutId: p.id });
      return true;
    }
    const next = p.stages[p.stageIndex + 1];
    if (!next) { await this.finish(p, p.txHash as Hex | null); return true; }
    const srcAsset = assetOf(run.fundingSource as PayoutOption);
    const dstAsset = assetOf(option);
    if (next === PAYOUT_STAGES.swapped) {
      const key = `swap:${p.id}`;
      if (this.deps.sera) {
        // Non-custodial: the treasury wallet signs the intent in the browser and the API submits it; here we only poll.
        if (!p.swapTradeId) return false;
        this.deps.sera.rememberTrade(p.id, p.swapTradeId, dstAsset);
        const st = await this.deps.sera.getStatus(p.id);
        if (!st || st.status === 'submitted') return false;
        if (st.status === 'failed') throw new Error(`Sera.cx settlement failed: ${st.reason ?? 'unknown'}`);
        await this.advance(p, { swapTxHash: st.txHash }, opId, 'payout.swapped');
        return true;
      }
      const recipient = (isBank(option) ? '0x000000000000000000000000000000000000Ba5e' : p.addressSnapshot) as Address;
      const [res] = await this.deps.swap.settle([{ payoutId: p.id, from: srcAsset, to: dstAsset, amountIn: p.amount, minAmountOut: p.amount, recipient, rateReference: p.swapReference ?? '' }], { address: '0x0000000000000000000000000000000000000000', signTypedData: async () => '0x' }, 'ethereum', key);
      if (!res || res.status === 'failed') throw new Error(`Swap on Sera.cx failed: ${res?.reason ?? 'unknown'}`);
      if (res.status === 'submitted') return false;
      await this.advance(p, { swapTxHash: res.txHash }, opId, 'payout.swapped');
      return true;
    }
    if (next === PAYOUT_STAGES.sentWallet) {
      if (this.deps.config.CHAIN !== 'mock') {
        if (!run.disburseTx) return false;
        const rc = await this.deps.chain.waitForReceipt(run.disburseTx as Hex);
        if (rc.status === 'reverted') throw new Error('Disbursement transaction reverted.');
        await this.advance(p, { txHash: run.disburseTx }, opId, 'payout.sent');
        return true;
      }
      const res = await this.deps.chain.disburse(p.runId, [{ payoutId: p.id, stablecoin: dstAsset as Stablecoin, to: p.addressSnapshot as Address, amount: p.amount }], { address: '0x0000000000000000000000000000000000000000', signTypedData: async () => '0x', sendTransaction: async () => '0x' });
      const leg = res.legs.find((l) => l.payoutId === p.id);
      if (leg && !leg.ok) throw new Error(leg.reason ?? 'Transfer failed');
      await this.advance(p, { txHash: res.txHash }, opId, 'payout.sent');
      return true;
    }
    if (next === PAYOUT_STAGES.sentRamp) {
      const c = ccyOf(option) as Fiat;
      const person = (await this.deps.db.select().from(people).where(eq(people.id, p.personId)).limit(1))[0];
      const bp = await this.deps.ramps[c].createBankPayout(person?.kycPartnerRef ?? `mock-kyc-${p.personId}`, p.amount, c, p.id);
      if (bp.status === 'failed') throw new Error(bp.reason ?? 'Off-ramp partner rejected the payout');
      await this.advance(p, { bankPayoutId: bp.id, txHash: p.swapTxHash ?? p.txHash }, opId, 'payout.sent');
      return true;
    }
    if (next === PAYOUT_STAGES.arrived) {
      const c = ccyOf(option) as Fiat;
      const st = await this.deps.ramps[c].getPayoutStatus(p.bankPayoutId ?? '');
      if (st.status === 'failed') throw new Error(st.reason ?? 'Bank payout failed at the partner');
      if (st.status !== 'arrived') return false;
      await this.advance(p, {}, opId, 'payout.arrived');
      return true;
    }
    return false;
  }

  private async advance(p: PayoutRow, patch: Partial<PayoutRow>, opId: string, event: string): Promise<void> {
    const nextIdx = p.stageIndex + 1;
    const last = nextIdx >= p.stages.length - 1;
    const tx = (patch.txHash ?? p.txHash ?? null) as Hex | null;
    if (last) { await this.set(p.id, { ...patch, stageIndex: p.stages.length - 1, state: 'done', updatedAt: this.deps.now() }); await this.finish({ ...p, ...patch, stageIndex: p.stages.length - 1, state: 'done' } as PayoutRow, tx); }
    else await this.set(p.id, { ...patch, stageIndex: nextIdx, state: 'running', updatedAt: this.deps.now() });
    await this.deps.webhooks.emit(opId, event, { clientId: p.clientId, runId: p.runId, payoutId: p.id, stage: p.stages[last ? p.stages.length - 1 : nextIdx], txHash: tx });
  }

  private async finish(p: PayoutRow, _tx: Hex | null): Promise<void> {
    const siblings = await this.deps.db.select().from(payouts).where(eq(payouts.lineId, p.lineId));
    if (siblings.every((s) => s.state === 'done')) await sealLine(this.deps, p.lineId);
  }

  private async fail(p: PayoutRow, reason: string): Promise<void> {
    await this.set(p.id, { state: 'failed', failureReason: reason, updatedAt: this.deps.now() });
    const run = (await this.deps.db.select().from(payRuns).where(eq(payRuns.id, p.runId)).limit(1))[0];
    const t = await loadTenant(this.deps.db, p.clientId);
    await this.notifyEmployer(p.clientId, t.operator.id, 'payout.failed', { label: run?.label, personId: p.personId, reason });
    await this.deps.webhooks.emit(t.operator.id, 'payout.failed', { clientId: p.clientId, runId: p.runId, payoutId: p.id, reason });
  }

  private async notifyEmployer(clientId: string, operatorId: string, kind: 'payout.failed' | 'payout.held', data: Record<string, unknown>): Promise<void> {
    const { users } = await import('@sera-payroll/db');
    const rows = await this.deps.db.select().from(users).where(and(eq(users.clientId, clientId), inArray(users.role, ['preparer', 'approver'])));
    for (const u of rows) await this.deps.notifier.send({ email: u.email, name: u.name }, kind, data, { operatorId, clientId });
  }

  private async set(id: string, patch: Partial<PayoutRow>): Promise<void> {
    await this.deps.db.update(payouts).set(patch).where(eq(payouts.id, id));
  }

  async closeRunIfDone(runId: string): Promise<void> {
    const ps = await this.deps.db.select({ state: payouts.state }).from(payouts).where(eq(payouts.runId, runId));
    if (!ps.length || ps.some((p) => p.state === 'queued' || p.state === 'running' || p.state === 'failed')) return;
    const run = (await this.deps.db.select().from(payRuns).where(eq(payRuns.id, runId)).limit(1))[0];
    if (!run || run.status !== 'sent') return;
    await this.deps.db.update(payRuns).set({ status: 'complete', completedAt: this.deps.now() }).where(eq(payRuns.id, runId));
    const t = await loadTenant(this.deps.db, run.clientId);
    await this.deps.webhooks.emit(t.operator.id, 'run.complete', { clientId: run.clientId, runId, label: run.label });
  }
}

/** Retry one failed payout. Idempotent: the caller wraps this in withIdempotency, and settlement keys are per payout. */
export async function retryPayout(db: Db, clientId: string, payoutId: string): Promise<PayoutRow> {
  const p = (await db.select().from(payouts).where(and(eq(payouts.id, payoutId), eq(payouts.clientId, clientId))).limit(1))[0];
  if (!p) throw new Error('not_found');
  if (p.state !== 'failed') throw new Error('not_failed');
  await db.update(payouts).set({ state: 'queued', stageIndex: 0, failureReason: null, updatedAt: new Date() }).where(eq(payouts.id, payoutId));
  await db.update(payRuns).set({ status: 'sent', completedAt: null }).where(eq(payRuns.id, p.runId));
  return (await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1))[0]!;
}

export { runLines };
