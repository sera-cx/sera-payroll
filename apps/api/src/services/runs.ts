import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { keccak256, toHex, verifyTypedData, zeroAddress, type Address, type Hex } from 'viem';
import {
  FUNDING_OPTIONS, SAMPLE_RATES, assetOf, PAYRUN_APPROVAL_TYPES, assertApprover, assertTransition, buildRecord, canonicalJson, ccyOf, dp, fixed, idToBytes32, isBank, lines, pathSteps, payrollDomain, rateLine, recordStatus, runInfo, totals, flatSamplePlugin, D,
  type EngineContext, type Fiat, type LineKind, type PayoutOption, type RunDraft, type Totals, type Line, type Plugins,
} from '@sera-payroll/core';
import { clients, idempotencyKeys, payRuns, payouts, payslips, people, runLines, users, type Db } from '@sera-payroll/db';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors.js';
import { uuid } from '../ids.js';
import type { Deps } from './deps.js';
import { corePeople } from './people.js';
import { loadPlugins, loadRamps, loadTenant, type Tenant } from './tenancy.js';
import { audit } from './audit.js';
import type { SettlementLeg } from '@sera-payroll/core';

export type RunRow = typeof payRuns.$inferSelect;
export type PayoutRow = typeof payouts.$inferSelect;
export type LineRow = typeof runLines.$inferSelect;

const NETWORK_FEE_USD = '0.20';
const PLUGIN_RATE = '0.10';

/** Demo balances live on the client row; on a real chain they are read from the treasury wallet. */
export async function balancesFor(deps: Deps, t: Tenant): Promise<Record<string, string>> {
  if (deps.config.CHAIN === 'mock' || !t.client.treasuryWallet) return t.client.balances;
  const b = await deps.chain.balances(t.client.treasuryWallet as Address, ['USDT', 'USDC', 'MYRT', 'XSGD', 'IDRT', 'JPYC']);
  return Object.fromEntries(b.map((x) => [x.stablecoin, x.balance]));
}

/**
 * The run the Pay run tab shows. An open draft or submitted run wins. Otherwise the most recently
 * sent run stays current (so its payout tracking is visible) until the employer drafts the next
 * one, which `mode: 'next'` does. With no run at all, the first draft is created.
 */
export async function currentRunRow(db: Db, clientId: string, mode: 'view' | 'next' = 'view'): Promise<RunRow> {
  const open = (await db.select().from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['draft', 'submitted']))).orderBy(desc(payRuns.createdAt)).limit(1))[0];
  if (open) return open;
  const lastSent = (await db.select().from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['sent', 'complete']), eq(payRuns.nextDrafted, false))).orderBy(desc(payRuns.sentAt)).limit(1))[0];
  if (lastSent && mode === 'view') return lastSent;
  if (lastSent) await db.update(payRuns).set({ nextDrafted: true }).where(eq(payRuns.id, lastSent.id));
  const [m] = await db.select({ m: max(payRuns.idx) }).from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['sent', 'complete'])));
  const idx = m?.m == null ? 0 : Math.max(0, m.m + 1);
  const c = (await db.select().from(clients).where(eq(clients.id, clientId)).limit(1))[0]!;
  const inf = runInfo(c.settings.schedule as never, idx);
  // The next run copies the last run's funding source, else the client default, else USDT.
  const last = (await db.select({ f: payRuns.fundingSource }).from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['sent', 'complete']))).orderBy(desc(payRuns.sentAt)).limit(1))[0];
  const candidate = (last?.f ?? c.settings.defaultFunding ?? 'USDT') as PayoutOption;
  const id = uuid();
  await db.insert(payRuns).values({ id, clientId, idx, label: inf.label, payDate: inf.paydayText, status: 'draft', fundingSource: FUNDING_OPTIONS.includes(candidate) ? candidate : 'USDT', rates: SAMPLE_RATES, rateSource: 'sample' });
  return (await db.select().from(payRuns).where(eq(payRuns.id, id)).limit(1))[0]!;
}

export interface Loaded { t: Tenant; run: RunRow; ctx: EngineContext; plugins: Plugins; rampsView: Awaited<ReturnType<typeof loadRamps>> }

export async function loadEngine(deps: Deps, clientId: string, run?: RunRow): Promise<Loaded> {
  const t = await loadTenant(deps.db, clientId);
  const r = run ?? (await currentRunRow(deps.db, clientId));
  const [peopleList, rampsView, pl, balances] = await Promise.all([corePeople(deps.db, clientId), loadRamps(deps.db, t.operator.id), loadPlugins(deps.db, t.operator.id), balancesFor(deps, t)]);
  const draft: RunDraft = { idx: r.idx, status: r.status, fundingSource: r.fundingSource as PayoutOption, oneOffs: r.oneOffs.map((o) => ({ id: o.id, personId: o.personId, amount: o.amount, currency: o.currency as Fiat, kind: o.kind as Exclude<LineKind, 'Salary'> })), skipped: r.skipped, funded: r.funded };
  const ctx: EngineContext = { people: peopleList, run: draft, settings: t.settings, ramps: rampsView.ramps, plugins: pl.plugins, rates: (r.rates as Record<Fiat, string> | null) ?? SAMPLE_RATES, balances, networkFeeUsd: NETWORK_FEE_USD, pluginRate: PLUGIN_RATE };
  return { t, run: r, ctx, plugins: pl.plugins, rampsView };
}

function json(v: unknown): unknown { return JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && 'toFixed' in x && typeof (x as { toFixed: unknown }).toFixed === 'function' && 'd' in x ? String(x) : x))); }

/** Approval typed data for the current draft. Signing it binds the approver to these exact payouts and rates. */
export function approvalTypedData(deps: Deps, L: Loaded, computed: Line[], tot: Totals) {
  const legs = computed.flatMap((l) => l.legs.filter((g) => !g.issue).map((g) => ({ personId: l.person.id, kind: l.kind, option: g.option, amount: g.amount.toString(), address: isBank(g.option) ? null : l.person.wallet.address, flagged: g.flagged })));
  const payoutsRoot = keccak256(toHex(canonicalJson(legs)));
  const ratesLockedAt = Math.floor((L.run.submittedAt ?? L.run.createdAt).getTime() / 1000);
  const verifying = (deps.config.PAYROLL_DISBURSER_ADDRESS ?? zeroAddress) as Address;
  return {
    domain: payrollDomain(deps.chain.chainId, verifying, L.t.operator.brand),
    types: PAYRUN_APPROVAL_TYPES,
    primaryType: 'PayRunApproval' as const,
    message: {
      runId: idToBytes32(L.run.id), clientId: idToBytes32(L.t.client.id), fundingAsset: tot.fundingAsset,
      totalMinor: BigInt(fixed(tot.need, tot.fundingCurrency).replace('.', '')), payoutCount: tot.count, payoutsRoot, ratesLockedAt: BigInt(ratesLockedAt),
    },
  };
}

export async function runView(deps: Deps, L: Loaded) {
  const computed = lines(L.ctx);
  const tot = totals(L.ctx, computed);
  const inf = runInfo(L.ctx.settings.schedule, L.run.idx);
  const fc = tot.fundingCurrency;
  const [prep, appr] = await Promise.all([L.run.preparedBy ? userBrief(deps.db, L.run.preparedBy) : null, L.run.approvedBy ? userBrief(deps.db, L.run.approvedBy) : null]);
  const showApproval = L.run.status === 'submitted' || (L.run.status === 'draft' && !L.ctx.settings.twoPerson);
  const td = showApproval ? approvalTypedData(deps, L, computed, tot) : null;
  let deposit: unknown = undefined;
  if (tot.funding.kind === 'bank' && !L.run.funded && tot.funding.rampOk) {
    const d = await deps.ramps[fc].getDepositInstructions(L.t.client.id, fixed(tot.need, fc), fc);
    deposit = { reference: L.run.fundingReference ?? `PAYRUN-${L.run.idx + 1}`, beneficiary: d.beneficiary, accountDetails: d.accountDetails, amount: d.amount, currency: fc };
  }
  return {
    id: L.run.id, idx: L.run.idx, status: L.run.status, label: inf.label, payday: inf.paydayText, schedule: L.ctx.settings.schedule, per: inf.per,
    fundingSource: L.run.fundingSource, funded: L.run.funded,
    fundingOptions: FUNDING_OPTIONS.map((o) => ({ option: o, enabled: !isBank(o) || L.ctx.ramps[ccyOf(o)].onRamp, reason: isBank(o) && !L.ctx.ramps[ccyOf(o)].onRamp ? 'no on-ramp connected' : undefined })),
    preparedBy: prep, approvedBy: appr, sentAt: L.run.sentAt,
    lines: computed.map((l) => ({
      personId: l.person.id, name: l.person.name, type: l.person.type, kind: l.kind, currency: l.currency, gross: fixed(l.gross, l.currency), deduction: fixed(l.deduction, l.currency), net: fixed(l.net, l.currency), skipped: l.skipped, oneOffId: l.oneOffId,
      legs: l.legs.map((g) => ({ option: g.option, sharePercent: g.sharePercent, amount: fixed(g.amount, ccyOf(g.option)), issue: g.issue, flagged: g.flagged, rateLine: rateLine(L.run.fundingSource as PayoutOption, g.option, L.ctx.rates), path: pathSteps(L.run.fundingSource as PayoutOption, g.option) })),
    })),
    totals: {
      fundingCurrency: fc, fundingAsset: tot.fundingAsset, payouts: fixed(tot.payouts, fc), count: tot.count, swaps: tot.swaps, toBank: tot.toBank, toWallet: tot.toWallet, issues: tot.issues, held: tot.held,
      fee: fixed(tot.fee, fc), feePercent: L.ctx.settings.feePercent, gas: fixed(tot.gas, fc), need: fixed(tot.need, fc),
      funding: tot.funding.kind === 'bank' ? { ...tot.funding, deposit } : tot.funding, ready: tot.ready, canSend: tot.canSend,
    },
    rates: L.ctx.rates, ratesAsOf: (L.run.submittedAt ?? L.run.createdAt).toISOString(), rateSource: L.run.rateSource ?? 'sample',
    approval: td ? json({ ...td, message: { ...td.message, totalMinor: td.message.totalMinor.toString(), ratesLockedAt: td.message.ratesLockedAt.toString() } }) : undefined,
    multisig: L.ctx.settings.multisig ? { collected: L.run.approvalSignatures.map((s) => s.signer), threshold: 2 } : undefined,
    chainPlan: L.run.chainPlan ?? undefined,
  };
}

async function userBrief(db: Db, id: string): Promise<{ id: string; name: string } | null> {
  const u = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1))[0];
  return u ?? null;
}

export function assertDraft(run: RunRow): void {
  if (run.status !== 'draft') throw conflict('run_not_draft', 'This run is no longer a draft.');
}

export async function patchDraft(deps: Deps, clientId: string, patch: { fundingSource?: PayoutOption; funded?: boolean }): Promise<void> {
  const run = await currentRunRow(deps.db, clientId);
  assertDraft(run);
  const set: Partial<RunRow> = {};
  if (patch.fundingSource) { if (!FUNDING_OPTIONS.includes(patch.fundingSource)) throw badRequest('bad_option', 'That funding option is not supported.'); set.fundingSource = patch.fundingSource; set.funded = false; set.fundingReference = null; }
  if (patch.funded !== undefined) set.funded = patch.funded;
  await deps.db.update(payRuns).set(set).where(eq(payRuns.id, run.id));
}

export async function addOneOff(deps: Deps, clientId: string, o: { personId: string; amount: string; currency: Fiat; kind: Exclude<LineKind, 'Salary'> }): Promise<void> {
  const run = await currentRunRow(deps.db, clientId);
  assertDraft(run);
  if (!D(o.amount).gt(0)) throw badRequest('bad_amount', 'Amount must be above zero.');
  const p = (await deps.db.select({ id: people.id }).from(people).where(and(eq(people.id, o.personId), eq(people.clientId, clientId))).limit(1))[0];
  if (!p) throw notFound('Person');
  await deps.db.update(payRuns).set({ oneOffs: [...run.oneOffs, { id: uuid(), personId: o.personId, amount: D(o.amount).toString(), currency: o.currency, kind: o.kind }] }).where(eq(payRuns.id, run.id));
}

export async function removeOneOff(deps: Deps, clientId: string, oneOffId: string): Promise<void> {
  const run = await currentRunRow(deps.db, clientId);
  assertDraft(run);
  await deps.db.update(payRuns).set({ oneOffs: run.oneOffs.filter((x) => x.id !== oneOffId) }).where(eq(payRuns.id, run.id));
}

export async function setSkipped(deps: Deps, clientId: string, personId: string, skipped: boolean): Promise<void> {
  const run = await currentRunRow(deps.db, clientId);
  assertDraft(run);
  const s = new Set(run.skipped);
  if (skipped) s.add(personId); else s.delete(personId);
  await deps.db.update(payRuns).set({ skipped: [...s] }).where(eq(payRuns.id, run.id));
}

export async function removePersonFromDraft(db: Db, clientId: string, personId: string): Promise<void> {
  const run = (await db.select().from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['draft', 'submitted']))).limit(1))[0];
  if (!run) return;
  await db.update(payRuns).set({ oneOffs: run.oneOffs.filter((x) => x.personId !== personId), skipped: run.skipped.filter((x) => x !== personId) }).where(eq(payRuns.id, run.id));
}

export async function submitRun(deps: Deps, clientId: string, runId: string, actor: { id: string; name: string }): Promise<void> {
  const L = await loadEngine(deps, clientId);
  if (L.run.id !== runId) throw notFound('Run');
  if (!L.ctx.settings.twoPerson) throw conflict('no_two_person', 'Two-person approval is off. Review, sign and send instead.');
  assertTransition(L.run.status, 'submitted', true);
  const tot = totals(L.ctx);
  if (!tot.ready) throw conflict('not_ready', `Fix ${tot.issues} issue${tot.issues === 1 ? '' : 's'} before this run can go.`);
  await deps.db.update(payRuns).set({ status: 'submitted', preparedBy: actor.id, submittedAt: deps.now(), rates: L.ctx.rates, rateSource: L.run.rateSource ?? 'sample' }).where(eq(payRuns.id, runId));
  const approvers = await deps.db.select().from(users).where(and(eq(users.clientId, clientId), eq(users.role, 'approver')));
  const scope = { operatorId: L.t.operator.id, clientId };
  for (const a of approvers) await deps.notifier.send({ email: a.email, name: a.name }, 'run.submitted', { label: L.run.label, preparedBy: actor.name }, scope);
  await deps.webhooks.emit(L.t.operator.id, 'run.submitted', { clientId, runId, label: L.run.label, need: fixed(tot.need, tot.fundingCurrency), fundingSource: L.run.fundingSource });
  await audit(deps.db, { operatorId: L.t.operator.id, clientId, actor: actor.id, action: 'run.submitted', subject: runId });
}

export async function unsubmitRun(deps: Deps, clientId: string, runId: string, actor: string): Promise<void> {
  const run = (await deps.db.select().from(payRuns).where(and(eq(payRuns.id, runId), eq(payRuns.clientId, clientId))).limit(1))[0];
  if (!run) throw notFound('Run');
  assertTransition(run.status, 'draft', true);
  await deps.db.update(payRuns).set({ status: 'draft', preparedBy: null, submittedAt: null, approvalSignatures: [] }).where(eq(payRuns.id, runId));
  const t = await loadTenant(deps.db, clientId);
  await audit(deps.db, { operatorId: t.operator.id, clientId, actor, action: 'run.unsubmitted', subject: runId });
}

export async function withIdempotency<T>(db: Db, scope: string, key: string | undefined, fn: () => Promise<{ status: number; body: T }>): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!key) throw badRequest('idempotency_key_required', 'Send an Idempotency-Key header.');
  const prev = (await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key))).limit(1))[0];
  if (prev) return { status: prev.statusCode, body: prev.response as T, replayed: true };
  const r = await fn();
  await db.insert(idempotencyKeys).values({ scope, key, statusCode: r.status, response: r.body as unknown }).onConflictDoNothing();
  return { ...r, replayed: false };
}

export interface ApproveInput { signature: string; signerAddress?: string | null; simulateFailure?: boolean }

async function verifyApprovalSignature(deps: Deps, L: Loaded, computed: Line[], tot: Totals, input: ApproveInput): Promise<string> {
  if (deps.config.DEMO_MODE && input.signature === 'demo') return 'demo';
  if (!input.signerAddress) throw badRequest('signer_required', 'signerAddress is required.');
  const signer = input.signerAddress as Address;
  const allowed = [L.t.client.treasuryWallet, ...L.t.client.signers].filter(Boolean).map((a) => a!.toLowerCase());
  if (!allowed.includes(signer.toLowerCase())) throw forbidden('That wallet is not a registered signer for this client.');
  const td = approvalTypedData(deps, L, computed, tot);
  const ok = await verifyTypedData({ address: signer, domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message, signature: input.signature as Hex }).catch(() => false);
  if (!ok) throw unprocessable('bad_signature', 'The signature does not match this run. If the run changed after you signed, review and sign again.');
  return signer;
}

export async function collectMultisig(deps: Deps, clientId: string, runId: string, input: { signature: string; signerAddress: string }): Promise<string[]> {
  const L = await loadEngine(deps, clientId);
  if (L.run.id !== runId) throw notFound('Run');
  if (!L.ctx.settings.multisig) throw conflict('not_multisig', 'This client does not use a multisig treasury.');
  const computed = lines(L.ctx);
  const tot = totals(L.ctx, computed);
  const signer = await verifyApprovalSignature(deps, L, computed, tot, input);
  const sigs = L.run.approvalSignatures.filter((s) => s.signer.toLowerCase() !== signer.toLowerCase()).concat({ signer, signature: input.signature });
  await deps.db.update(payRuns).set({ approvalSignatures: sigs }).where(eq(payRuns.id, runId));
  return sigs.map((s) => s.signer);
}

/** Approver signs and sends: verify, snapshot, debit, start the worker. */
export async function approveRun(deps: Deps, clientId: string, runId: string, actor: { id: string; name: string }, input: ApproveInput): Promise<Record<string, unknown>> {
  const L = await loadEngine(deps, clientId);
  if (L.run.id !== runId) throw notFound('Run');
  const s = L.ctx.settings;
  assertTransition(L.run.status, 'sent', s.twoPerson);
  assertApprover(L.run.preparedBy, actor.id, s.twoPerson);
  const computed = lines(L.ctx);
  const tot = totals(L.ctx, computed);
  if (!tot.ready) throw conflict('not_ready', `Fix ${tot.issues} issue${tot.issues === 1 ? '' : 's'} before this run can go.`);
  if (!tot.funding.ok) throw conflict('funding', 'Funding check has not passed yet.');
  const signer = await verifyApprovalSignature(deps, L, computed, tot, input);
  let signedWith = signer === 'demo' ? 'demo' : `wallet ${signer}`;
  if (s.multisig) {
    const sigs = L.run.approvalSignatures.filter((x) => x.signer.toLowerCase() !== signer.toLowerCase()).concat(signer === 'demo' ? [] : [{ signer, signature: input.signature }]);
    const have = signer === 'demo' ? Math.max(sigs.length, 2) : sigs.length;
    if (have < 2) throw conflict('more_signatures', `A 2 of 3 multisig needs 2 signatures; ${have} collected.`);
    signedWith = 'a 2 of 3 multisig';
  }
  const rec = buildRecord(L.ctx, () => uuid(), computed);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    let pos = 0;
    let failSet = false;
    for (const item of rec.items) {
      const lineId = uuid();
      await tx.insert(runLines).values({ id: lineId, runId, clientId, personId: item.personId, personName: item.name, personType: item.type, kind: item.kind, currency: item.currency, gross: item.gross, deduction: item.deduction, net: item.net, skipped: false, oneOffId: null, position: pos++ });
      let ppos = 0;
      for (const p of item.payouts) {
        const willFail = !!input.simulateFailure && deps.config.DEMO_MODE && !failSet && p.state !== 'held';
        if (willFail) failSet = true;
        await tx.insert(payouts).values({
          id: p.id, runId, lineId, clientId, personId: item.personId, option: p.option, sharePercent: p.sharePercent, amount: p.amount, amountText: p.amountText, sub: p.sub, lockedRate: p.lockedRate, usdValue: p.usdValue, needsSwap: p.needsSwap,
          stages: p.stages, stageIndex: 0, state: p.state, failureReason: p.failureReason, addressSnapshot: p.addressSnapshot, networkSnapshot: p.networkSnapshot, path: p.path, willFail, position: ppos++,
        });
      }
    }
    await tx.update(payRuns).set({ status: 'sent', approvedBy: actor.id, preparedBy: L.run.preparedBy ?? (s.twoPerson ? L.run.preparedBy : actor.id), signedWith, sentAt: now, totals: json({ ...tot, payouts: tot.payouts.toString(), fee: tot.fee.toString(), gas: tot.gas.toString(), need: tot.need.toString() }) as Record<string, unknown>, rates: L.ctx.rates }).where(eq(payRuns.id, runId));
    if (deps.config.CHAIN === 'mock' && !isBank(L.run.fundingSource as PayoutOption)) {
      const bal = { ...L.t.client.balances };
      bal[L.run.fundingSource] = D(bal[L.run.fundingSource] ?? '0').minus(tot.need).toString();
      await tx.update(clients).set({ balances: bal }).where(eq(clients.id, clientId));
    }
  });
  // Non-custodial plan for a real chain: what the treasury wallet must sign and send itself.
  let chainPlan: Record<string, unknown> | null = null;
  if (deps.config.CHAIN !== 'mock') chainPlan = await buildChainPlan(deps, L, rec, runId);
  if (chainPlan) await deps.db.update(payRuns).set({ chainPlan }).where(eq(payRuns.id, runId));
  const scope = { operatorId: L.t.operator.id, clientId };
  for (const item of rec.items) {
    if (!item.payouts.some((p) => p.state !== 'held')) continue;
    const person = (await deps.db.select().from(people).where(eq(people.id, item.personId)).limit(1))[0];
    await deps.notifier.send({ email: person?.email ?? null, name: item.name }, 'paid', { label: rec.label, kind: item.kind }, scope);
  }
  await deps.webhooks.emit(L.t.operator.id, 'run.sent', { clientId, runId, label: rec.label, need: rec.need, fundingSource: rec.fundingSource, count: rec.count });
  await audit(deps.db, { operatorId: L.t.operator.id, clientId, actor: actor.id, action: 'run.approved', subject: runId, detail: { signedWith, need: rec.need } });
  const view = await recordView(deps, clientId, runId);
  return chainPlan ? { ...view, chainPlan } : view;
}

async function buildChainPlan(deps: Deps, L: Loaded, rec: ReturnType<typeof buildRecord>, runId: string): Promise<Record<string, unknown>> {
  const owner = (L.t.client.treasuryWallet ?? zeroAddress) as Address;
  const swaps: unknown[] = [];
  for (const item of rec.items) for (const p of item.payouts) {
    if (p.state === 'held' || !p.needsSwap) continue;
    const recipient = (isBank(p.option) ? zeroAddress : (p.addressSnapshot as Address)) as Address;
    const leg: SettlementLeg = { payoutId: p.id, from: rec.totals.fundingAsset, to: assetOf(p.option), amountIn: p.amount, minAmountOut: p.amount, recipient, rateReference: '' };
    if (!deps.sera) { swaps.push({ payoutId: p.id, error: 'SWAP_PROVIDER=sample cannot settle on a real chain. Set SWAP_PROVIDER=sera.' }); continue; }
    try { swaps.push({ payoutId: p.id, quote: await deps.sera.prepareIntent(leg, owner) }); }
    catch (e) { swaps.push({ payoutId: p.id, error: e instanceof Error ? e.message : String(e) }); }
  }
  const direct = rec.items.flatMap((i) => i.payouts.filter((p) => p.state !== 'held' && !p.needsSwap && !isBank(p.option)).map((p) => ({ payoutId: p.id, stablecoin: p.option, to: p.addressSnapshot, amount: p.amount })));
  const enc = (deps.chain as unknown as { encodeDisburse?: (runId: string, legs: unknown[]) => { to: string; data: string; value: string } | null }).encodeDisburse;
  return { swaps, disburse: enc ? enc(runId, direct) : null, directPayouts: direct };
}

export async function recordView(deps: Deps, clientId: string, runId: string) {
  const run = (await deps.db.select().from(payRuns).where(and(eq(payRuns.id, runId), eq(payRuns.clientId, clientId))).limit(1))[0];
  if (!run) throw notFound('Run');
  return recordOf(deps, run);
}

export async function recordOf(deps: Deps, run: RunRow) {
  const ls = await deps.db.select().from(runLines).where(eq(runLines.runId, run.id)).orderBy(asc(runLines.position));
  const ps = await deps.db.select().from(payouts).where(eq(payouts.runId, run.id)).orderBy(asc(payouts.position));
  const slips = await deps.db.select().from(payslips).where(eq(payslips.runId, run.id));
  const t = run.totals as Record<string, unknown> | null;
  const fc = ccyOf(run.fundingSource as PayoutOption);
  const items = ls.map((l) => ({
    lineId: l.id, personId: l.personId, name: l.personName, type: l.personType, kind: l.kind, currency: l.currency, gross: fixed(l.gross, l.currency as Fiat), deduction: fixed(l.deduction, l.currency as Fiat), net: fixed(l.net, l.currency as Fiat),
    payouts: ps.filter((p) => p.lineId === l.id).map((p) => payoutJson(deps, p)),
    payslip: (() => { const s = slips.find((x) => x.lineId === l.id); return s ? { id: s.id, root: s.root, docHash: s.docHash, anchorTx: s.anchorTx, anchorId: s.anchorId, employerSignature: s.employerSignature, explorerUrl: s.anchorTx ? deps.chain.explorerTxUrl(s.anchorTx as Hex) : null } : null; })(),
  }));
  const status = recordStatus({ items });
  const [prep, appr] = await Promise.all([run.preparedBy ? userBrief(deps.db, run.preparedBy) : null, run.approvedBy ? userBrief(deps.db, run.approvedBy) : null]);
  return {
    id: run.id, idx: run.idx, label: run.label, payday: run.payDate, fundingSource: run.fundingSource, fundingCurrency: fc,
    need: t?.need ? fixed(String(t.need), fc) : '0', fee: t?.fee ? fixed(String(t.fee), fc) : '0', gas: t?.gas ? fixed(String(t.gas), fc) : '0',
    count: Number(t?.count ?? ps.filter((p) => p.state !== 'held').length), swaps: Number(t?.swaps ?? ps.filter((p) => p.needsSwap).length), held: ps.filter((p) => p.state === 'held').length,
    status: run.status, statusText: status, sentAt: run.sentAt, completedAt: run.completedAt, preparedBy: prep, approvedBy: appr,
    by: prep && appr && prep.id !== appr.id ? 'Prepared by the preparer, approved by the approver' : 'Prepared and signed by one admin', signedWith: run.signedWith, rates: run.rates, items, chainPlan: run.chainPlan ?? undefined, disburseTx: run.disburseTx,
  };
}

export function payoutJson(deps: Deps, p: PayoutRow) {
  return {
    id: p.id, runId: p.runId, personId: p.personId, option: p.option, sharePercent: p.sharePercent, amount: fixed(p.amount, ccyOf(p.option as PayoutOption)), amountText: p.amountText, sub: p.sub, lockedRate: p.lockedRate, usdValue: fixed(p.usdValue, 'USD'),
    needsSwap: p.needsSwap, stages: p.stages, stageIndex: p.stageIndex, state: p.state, txHash: p.txHash, swapTxHash: p.swapTxHash, explorerUrl: p.txHash ? deps.chain.explorerTxUrl(p.txHash as Hex) : null,
    failureReason: p.failureReason, addressSnapshot: p.addressSnapshot, networkSnapshot: p.networkSnapshot, path: p.path, attempts: p.attempts, swapTradeId: p.swapTradeId, bankPayoutId: p.bankPayoutId,
  };
}

export async function listRecords(deps: Deps, clientId: string) {
  const runs = await deps.db.select().from(payRuns).where(and(eq(payRuns.clientId, clientId), inArray(payRuns.status, ['sent', 'complete']))).orderBy(desc(payRuns.sentAt));
  return Promise.all(runs.map((r) => recordOf(deps, r)));
}

export { sql };
