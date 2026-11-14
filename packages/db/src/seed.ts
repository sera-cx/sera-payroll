/**
 * Sample data: one operator, three clients, users per role, ramps, plug-ins and
 * one past run so History is not empty. Everything here is a sample.
 */
import { sql } from 'drizzle-orm';
import { SAMPLE_CLIENTS, SAMPLE_PLUGINS, SAMPLE_RAMPS, DEFAULT_HOLD_HOURS, buildRecord, sampleContext, type Fiat } from '@sera-payroll/core';
import type { Db } from './client.js';
import * as t from './schema.js';

export const SAMPLE_OPERATOR_ID = 'op-sample';
export const DEMO_APPROVER_SIGNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // viem/anvil account 0, demo only

function slug(name: string): string {
  return name.toLowerCase().replace(/ (sdn bhd|pte ltd|ltd)$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function fakeTx(seed: string): string {
  let h = '';
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 64; i++) { x = (x * 1103515245 + 12345) >>> 0; h += '0123456789abcdef'[(x >>> 16) & 15]; }
  return '0x' + h;
}

export async function resetAll(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE idempotency_keys, nonces, invites, magic_links, sessions, audit_log, api_keys, webhook_deliveries, webhooks, notifications, plugins, ramp_partners, payslips, payouts, run_lines, pay_runs, address_events, wallet_addresses, people, users, clients, operators CASCADE`);
}

export interface SeedSummary { operatorId: string; clientIds: string[]; userIds: string[] }

export async function seedSample(db: Db, opts: { reset?: boolean; brand?: string; holdHours?: number } = {}): Promise<SeedSummary> {
  if (opts.reset ?? true) await resetAll(db);
  const opId = SAMPLE_OPERATOR_ID;
  await db.insert(t.operators).values({ id: opId, name: 'Sample Payroll Co', brand: opts.brand ?? '[YOUR PAYROLL BRAND]', settings: { addressHoldHours: opts.holdHours ?? DEFAULT_HOLD_HOURS } });
  const userIds: string[] = [];
  await db.insert(t.users).values({ id: 'u-operator', operatorId: opId, clientId: null, personId: null, role: 'operator_admin', email: 'admin@sample-payroll.demo', name: 'Operator admin' });
  userIds.push('u-operator');

  for (const [ci, c] of SAMPLE_CLIENTS.entries()) {
    const s = slug(c.name);
    await db.insert(t.clients).values({
      id: c.id, operatorId: opId, name: c.name, feePercent: c.settings.feePercent,
      settings: { twoPerson: c.settings.twoPerson, multisig: c.settings.multisig, schedule: c.settings.schedule, gasPayer: c.settings.gasPayer, requireTestPayment: c.settings.requireTestPayment, defaultFunding: c.fundingSource },
      treasuryWallet: null, signers: [DEMO_APPROVER_SIGNER], balances: c.balances,
    });
    const prep = `u-${s}-preparer`, appr = `u-${s}-approver`;
    await db.insert(t.users).values([
      { id: prep, operatorId: opId, clientId: c.id, personId: null, role: 'preparer', email: `preparer@${s}.demo`, name: `Preparer (${c.name})` },
      { id: appr, operatorId: opId, clientId: c.id, personId: null, role: 'approver', email: `approver@${s}.demo`, name: `Approver (${c.name})`, walletAddress: DEMO_APPROVER_SIGNER },
    ]);
    userIds.push(prep, appr);
    for (const p of c.people) {
      const email = `${slug(p.name)}@${s}.demo`;
      await db.insert(t.people).values({
        id: p.id, clientId: c.id, name: p.name, type: p.type, monthlyPay: p.monthlyPay, currency: p.currency,
        payoutPrimary: p.payoutPrimary, payoutSecondary: p.payoutSecondary, splitPercent: p.splitPercent,
        kycStatus: p.kycVerified ? 'verified' : 'not_started', setupDone: p.setupDone, email,
        setupAt: p.setupDone ? new Date('2026-10-01T00:00:00Z') : null,
      });
      await db.insert(t.walletAddresses).values({
        personId: p.id, clientId: c.id, address: p.wallet.address, network: p.wallet.network, source: p.wallet.source, locked: p.wallet.locked, tested: p.wallet.tested,
        screeningStatus: p.wallet.address ? 'clear' : 'unscreened', pending: null,
      });
      if (p.wallet.address) {
        await db.insert(t.addressEvents).values({ id: `ae-${p.id}-0`, personId: p.id, clientId: c.id, actor: 'sample', action: (p.wallet.source === 'employer' ? 'Entered by employer' : 'Signed by employee') + (p.wallet.locked ? ', then locked by employer' : ''), oldAddress: null, newAddress: p.wallet.address, at: new Date('2026-10-01T00:00:00Z') });
      }
      const uid = `u-${s}-${slug(p.name)}`;
      await db.insert(t.users).values({ id: uid, operatorId: opId, clientId: c.id, personId: p.id, role: 'employee', email, name: p.name });
      userIds.push(uid);
    }
    if (ci === 0) await seedPastRun(db, c.id, prep, appr);
  }

  for (const ccy of Object.keys(SAMPLE_RAMPS) as Fiat[]) {
    const r = SAMPLE_RAMPS[ccy];
    await db.insert(t.rampPartners).values({ id: `ramp-${ccy}`, operatorId: opId, currency: ccy, onRamp: r.onRamp, offRamp: r.offRamp, adapter: 'mock', partnerName: '[PARTNER NAME]' });
  }
  const countries: Record<string, string> = { MYR: 'Malaysia', SGD: 'Singapore', IDR: 'Indonesia' };
  for (const ccy of Object.keys(SAMPLE_PLUGINS) as Fiat[]) {
    await db.insert(t.plugins).values({ id: `plugin-${ccy}`, operatorId: opId, currency: ccy, country: countries[ccy] ?? ccy, plugin: 'flat-sample', enabled: !!SAMPLE_PLUGINS[ccy] });
  }
  return { operatorId: opId, clientIds: SAMPLE_CLIENTS.map((c) => c.id), userIds };
}

/** October 2026 for the first client, complete, with sample hashes, as in the prototype seed. */
async function seedPastRun(db: Db, clientId: string, preparedBy: string, approvedBy: string): Promise<void> {
  const ctx = sampleContext(0);
  ctx.people = ctx.people.filter((p) => p.id !== 'p5');
  const runId = 'run-oct-2026';
  const rec = buildRecord(ctx, (pid, i) => `po-oct-${pid}-${i}`);
  const sentAt = new Date('2026-10-28T09:00:00Z');
  await db.insert(t.payRuns).values({
    id: runId, clientId, idx: -1, label: 'October 2026', payDate: '28 Oct 2026', status: 'complete', fundingSource: ctx.run.fundingSource, funded: true, nextDrafted: true,
    oneOffs: [], skipped: [], totals: JSON.parse(JSON.stringify({ ...rec.totals, payouts: rec.totals.payouts.toString(), fee: rec.fee, gas: rec.gas, need: rec.need })),
    rates: ctx.rates, rateSource: 'sample', preparedBy, approvedBy, signedWith: 'a single wallet (sample)', submittedAt: sentAt, sentAt, completedAt: sentAt, createdAt: sentAt,
  });
  let pos = 0;
  for (const item of rec.items) {
    const lineId = `line-oct-${item.personId}-${pos}`;
    await db.insert(t.runLines).values({ id: lineId, runId, clientId, personId: item.personId, personName: item.name, personType: item.type, kind: item.kind, currency: item.currency, gross: item.gross, deduction: item.deduction, net: item.net, skipped: false, oneOffId: null, position: pos++ });
    let ppos = 0;
    for (const p of item.payouts) {
      await db.insert(t.payouts).values({
        id: p.id, runId, lineId, clientId, personId: item.personId, option: p.option, sharePercent: p.sharePercent, amount: p.amount, amountText: p.amountText, sub: p.sub, lockedRate: p.lockedRate, usdValue: p.usdValue, needsSwap: p.needsSwap,
        stages: p.stages, stageIndex: p.stages.length - 1, state: 'done', txHash: fakeTx(p.id), swapTxHash: p.needsSwap ? fakeTx(p.id + 'swap') : null, addressSnapshot: p.addressSnapshot, networkSnapshot: p.networkSnapshot, path: p.path, attempts: 1, position: ppos++, updatedAt: sentAt,
      });
    }
  }
}
