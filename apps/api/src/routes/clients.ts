import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { FIAT, SCHEDULES, accountingCsv, importMessage, parsePayFile, LOCAL, type Fiat, type PayoutOption, type LineKind } from '@sera-payroll/core';
import { auditLog, clients, notifications, payouts, people, walletAddresses } from '@sera-payroll/db';
import type { Deps } from '../services/deps.js';
import { requireClientAccess, requireUser, type AuthUser } from '../services/auth.js';
import { loadPlugins, loadRamps, loadTenant, rampsJson, settingsOf } from '../services/tenancy.js';
import { applyDueChanges, approvePendingAddress, cancelPendingAddress, createInvite, employerEnterAddress, lockAddress, personView, personViews, testPayment } from '../services/people.js';
import { addOneOff, approveRun, balancesFor, collectMultisig, currentRunRow, listRecords, loadEngine, patchDraft, payoutJson, recordView, removeOneOff, removePersonFromDraft, runView, setSkipped, submitRun, unsubmitRun, withIdempotency } from '../services/runs.js';
import { discloseFields, getPayslip, payslipPdf } from '../services/payslips.js';
import { retryPayout, type PayoutWorker } from '../services/worker.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { audit } from '../services/audit.js';
import { uuid } from '../ids.js';
import { D } from '@sera-payroll/core';

const PersonBody = z.object({ name: z.string().min(1), type: z.enum(['Employee', 'Contractor']).default('Employee'), monthlyPay: z.union([z.string(), z.number()]).transform(String), currency: z.enum(FIAT), email: z.string().email().nullable().optional() });

export function clientRoutes(deps: Deps, worker: PayoutWorker) {
  return async function (app: FastifyInstance) {
    // Resolve and authorise the client for every route under /clients/:clientId.
    app.addHook('preHandler', async (req) => {
      const { clientId } = req.params as { clientId?: string };
      if (!clientId) return;
      const t = await loadTenant(deps.db, clientId);
      (req as unknown as { tenant: typeof t }).tenant = t;
      requireClientAccess(req, clientId, t.operator.id);
    });
    const tenantOf = (req: { tenant?: Awaited<ReturnType<typeof loadTenant>> }) => req.tenant!;
    const settingsJson = (t: Awaited<ReturnType<typeof loadTenant>>) => ({ ...settingsOf(t.client, t.operator), treasuryWallet: t.client.treasuryWallet, signers: t.client.signers, brand: t.operator.brand });
    const view = async (clientId: string) => runView(deps, await loadEngine(deps, clientId));
    const needRole = (req: { user: AuthUser | null }, ...roles: AuthUser['role'][]) => { const u = requireUser(req as never); if (!roles.includes(u.role)) throw forbidden(`This needs ${roles.join(' or ')}.`); return u; };

    app.get<{ Params: { clientId: string } }>('/clients/:clientId', async (req) => {
      const t = tenantOf(req as never);
      const [r, p, balances] = await Promise.all([loadRamps(deps.db, t.operator.id), loadPlugins(deps.db, t.operator.id), balancesFor(deps, t)]);
      return { id: t.client.id, name: t.client.name, settings: settingsJson(t), ramps: rampsJson(r), plugins: p.plugins, balances, operator: { id: t.operator.id, name: t.operator.name, brand: t.operator.brand }, network: { name: deps.chain.network, chainId: deps.chain.chainId } };
    });
    app.patch<{ Params: { clientId: string } }>('/clients/:clientId/settings', async (req) => {
      const t = tenantOf(req as never);
      const b = z.object({ twoPerson: z.boolean().optional(), multisig: z.boolean().optional(), schedule: z.enum(SCHEDULES).optional(), gasPayer: z.enum(['employer', 'employee']).optional(), requireTestPayment: z.boolean().optional(), treasuryWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional() }).parse(req.body);
      if (b.schedule && b.schedule !== t.client.settings.schedule) {
        const run = await currentRunRow(deps.db, t.client.id);
        if (run.status !== 'draft') throw conflict('run_not_draft', 'The schedule can change only while the current run is a draft.');
        const { runInfo } = await import('@sera-payroll/core');
        const inf = runInfo(b.schedule, run.idx);
        const { payRuns } = await import('@sera-payroll/db');
        await deps.db.update(payRuns).set({ label: inf.label, payDate: inf.paydayText }).where(eq(payRuns.id, run.id));
      }
      const { treasuryWallet, ...rest } = b;
      await deps.db.update(clients).set({ settings: { ...t.client.settings, ...rest }, ...(treasuryWallet !== undefined ? { treasuryWallet } : {}) }).where(eq(clients.id, t.client.id));
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: req.user!.id, action: 'settings.changed', detail: b });
      return settingsJson(await loadTenant(deps.db, t.client.id));
    });

    // People
    app.get<{ Params: { clientId: string }; Querystring: { q?: string } }>('/clients/:clientId/people', async (req) => { await applyDueChanges(deps, req.params.clientId); return personViews(deps.db, req.params.clientId, req.query.q ?? ''); });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/people', async (req, reply) => {
      const t = tenantOf(req as never);
      const b = PersonBody.parse(req.body);
      if (!D(b.monthlyPay).gt(0)) throw badRequest('bad_amount', 'Monthly pay must be above zero.');
      const id = uuid();
      await deps.db.insert(people).values({ id, clientId: t.client.id, name: b.name, type: b.type, monthlyPay: D(b.monthlyPay).toString(), currency: b.currency, payoutPrimary: LOCAL[b.currency], email: b.email ?? null });
      await deps.db.insert(walletAddresses).values({ personId: id, clientId: t.client.id });
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: req.user!.id, action: 'person.added', subject: id });
      reply.code(201);
      return personView(deps.db, t.client.id, id);
    });
    app.patch<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id', async (req) => {
      const t = tenantOf(req as never);
      const b = PersonBody.partial().parse(req.body);
      if (b.monthlyPay !== undefined && !D(b.monthlyPay).gt(0)) throw badRequest('bad_amount', 'Monthly pay must be above zero.');
      const patch: Partial<typeof people.$inferInsert> = {};
      if (b.name) patch.name = b.name; if (b.type) patch.type = b.type; if (b.monthlyPay !== undefined) patch.monthlyPay = D(b.monthlyPay).toString(); if (b.email !== undefined) patch.email = b.email; if (b.currency) patch.currency = b.currency;
      const r = await deps.db.update(people).set(patch).where(and(eq(people.id, req.params.id), eq(people.clientId, t.client.id))).returning({ id: people.id });
      if (!r.length) throw notFound('Person');
      return personView(deps.db, t.client.id, req.params.id);
    });
    app.delete<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id', async (req, reply) => {
      const t = tenantOf(req as never);
      await removePersonFromDraft(deps.db, t.client.id, req.params.id);
      const r = await deps.db.delete(people).where(and(eq(people.id, req.params.id), eq(people.clientId, t.client.id))).returning({ id: people.id });
      if (!r.length) throw notFound('Person');
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: req.user!.id, action: 'person.removed', subject: req.params.id });
      reply.code(204); return null;
    });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/people/import', async (req) => {
      const t = tenantOf(req as never);
      const { text } = z.object({ text: z.string() }).parse(req.body);
      const existing = await personViews(deps.db, t.client.id);
      const r = parsePayFile(text, { names: existing.map((p) => p.name), addresses: existing.map((p) => p.wallet.address).filter((a): a is string => !!a) });
      for (const row of r.rows) {
        const id = uuid();
        await deps.db.insert(people).values({ id, clientId: t.client.id, name: row.name, type: row.type, monthlyPay: row.monthlyPay, currency: row.currency, payoutPrimary: LOCAL[row.currency] });
        await deps.db.insert(walletAddresses).values({ personId: id, clientId: t.client.id });
        if (row.address) await employerEnterAddress(deps, t, id, row.address, req.user!.id);
      }
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: req.user!.id, action: 'people.imported', detail: { imported: r.rows.length, rejected: r.rejected.length } });
      return { imported: r.rows.length, rejected: r.rejected, message: importMessage(r), people: await personViews(deps.db, t.client.id) };
    });
    app.post<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/invite', async (req) => {
      const t = tenantOf(req as never);
      const p = await personView(deps.db, t.client.id, req.params.id);
      const inv = await createInvite(deps.db, t.client.id, p.id);
      const url = `${deps.config.WEB_ORIGIN.replace(/\/$/, '')}/invite/${inv.token}`;
      await deps.notifier.send({ email: p.email, name: p.name }, 'invite', { url, brand: t.operator.brand }, { operatorId: t.operator.id, clientId: t.client.id });
      return { url, expiresAt: inv.expiresAt };
    });
    app.put<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/address', async (req) => {
      const t = tenantOf(req as never); const { address } = z.object({ address: z.string() }).parse(req.body);
      await employerEnterAddress(deps, t, req.params.id, address, req.user!.id); return personView(deps.db, t.client.id, req.params.id);
    });
    app.post<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/address/lock', async (req) => {
      const t = tenantOf(req as never); const { locked } = z.object({ locked: z.boolean() }).parse(req.body);
      await lockAddress(deps, t, req.params.id, locked, req.user!.id); return personView(deps.db, t.client.id, req.params.id);
    });
    app.post<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/address/approve', async (req) => { const t = tenantOf(req as never); await approvePendingAddress(deps, t, req.params.id, req.user!.id); return personView(deps.db, t.client.id, req.params.id); });
    app.post<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/address/reject', async (req) => { const t = tenantOf(req as never); await cancelPendingAddress(deps, t, req.params.id, req.user!.id); return personView(deps.db, t.client.id, req.params.id); });
    app.post<{ Params: { clientId: string; id: string } }>('/clients/:clientId/people/:id/address/test-payment', async (req) => { const t = tenantOf(req as never); await testPayment(deps, t, req.params.id, req.user!.id); return personView(deps.db, t.client.id, req.params.id); });

    // Current run (draft or submitted)
    app.get<{ Params: { clientId: string } }>('/clients/:clientId/runs/current', async (req) => { await applyDueChanges(deps, req.params.clientId); return view(req.params.clientId); });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/next', async (req) => { await currentRunRow(deps.db, req.params.clientId, 'next'); return view(req.params.clientId); });
    app.patch<{ Params: { clientId: string } }>('/clients/:clientId/runs/current', async (req) => {
      const b = z.object({ fundingSource: z.string().optional(), funded: z.boolean().optional() }).parse(req.body);
      if (b.funded && !deps.config.DEMO_MODE) throw forbidden('Funds are confirmed by the on-ramp partner, not by hand.');
      await patchDraft(deps, req.params.clientId, { fundingSource: b.fundingSource as PayoutOption | undefined, funded: b.funded }); return view(req.params.clientId);
    });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/one-offs', async (req) => {
      const b = z.object({ personId: z.string(), amount: z.union([z.string(), z.number()]).transform(String), currency: z.enum(FIAT), kind: z.enum(['Bonus', 'Contractor invoice', 'Reimbursement']) }).parse(req.body);
      await addOneOff(deps, req.params.clientId, { personId: b.personId, amount: b.amount, currency: b.currency as Fiat, kind: b.kind as Exclude<LineKind, 'Salary'> }); return view(req.params.clientId);
    });
    app.delete<{ Params: { clientId: string; oneOffId: string } }>('/clients/:clientId/runs/current/one-offs/:oneOffId', async (req) => { await removeOneOff(deps, req.params.clientId, req.params.oneOffId); return view(req.params.clientId); });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/skip', async (req) => { const b = z.object({ personId: z.string(), skipped: z.boolean() }).parse(req.body); await setSkipped(deps, req.params.clientId, b.personId, b.skipped); return view(req.params.clientId); });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/funding/instructions', async (req) => {
      const L = await loadEngine(deps, req.params.clientId);
      const fund = L.run.fundingSource as PayoutOption;
      if (!fund.startsWith('bank:')) throw conflict('not_bank', 'This run is funded from the treasury wallet.');
      const c = fund.slice(5) as Fiat;
      const { totals } = await import('@sera-payroll/core');
      const tot = totals(L.ctx);
      const d = await deps.ramps[c].getDepositInstructions(L.t.client.id, tot.need.toFixed(2), c);
      const { payRuns } = await import('@sera-payroll/db');
      await deps.db.update(payRuns).set({ fundingReference: d.reference }).where(eq(payRuns.id, L.run.id));
      return d;
    });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/funding/confirm', async (req) => {
      const { reference } = z.object({ reference: z.string().optional() }).parse(req.body ?? {});
      const L = await loadEngine(deps, req.params.clientId);
      const fund = L.run.fundingSource as PayoutOption;
      if (!fund.startsWith('bank:')) throw conflict('not_bank', 'This run is funded from the treasury wallet.');
      const c = fund.slice(5) as Fiat;
      const ref = reference ?? L.run.fundingReference ?? `PAYRUN-${L.run.idx + 1}`;
      const ramp = deps.ramps[c] as { markReceived?: (r: string) => void };
      if (deps.config.DEMO_MODE && ramp.markReceived) ramp.markReceived(ref);
      const r = await deps.ramps[c].confirmFundsReceived(ref);
      if (!r.received) throw conflict('not_received', 'The on-ramp partner has not confirmed your transfer yet.');
      await patchDraft(deps, req.params.clientId, { funded: true });
      return view(req.params.clientId);
    });
    app.post<{ Params: { clientId: string } }>('/clients/:clientId/runs/current/topup', async (req) => {
      if (!deps.config.DEMO_MODE || deps.config.CHAIN !== 'mock') throw notFound('Demo top-up');
      const L = await loadEngine(deps, req.params.clientId);
      const { totals } = await import('@sera-payroll/core');
      const tot = totals(L.ctx);
      const short = tot.funding.kind === 'wallet' ? Number(tot.funding.shortBy) : 0;
      const bal = { ...L.t.client.balances };
      bal[L.run.fundingSource] = D(bal[L.run.fundingSource] ?? '0').plus(Math.ceil(short / 100) * 100 + 100).toString();
      await deps.db.update(clients).set({ balances: bal }).where(eq(clients.id, L.t.client.id));
      return view(req.params.clientId);
    });
    app.post<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/submit', async (req) => { const u = needRole(req, 'preparer', 'operator_admin'); await submitRun(deps, req.params.clientId, req.params.runId, { id: u.id, name: u.name }); return view(req.params.clientId); });
    app.post<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/unsubmit', async (req) => { await unsubmitRun(deps, req.params.clientId, req.params.runId, req.user!.id); return view(req.params.clientId); });
    app.post<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/multisig/sign', async (req) => {
      needRole(req, 'approver', 'operator_admin');
      const b = z.object({ signature: z.string(), signerAddress: z.string() }).parse(req.body);
      return { collected: await collectMultisig(deps, req.params.clientId, req.params.runId, b), threshold: 2 };
    });
    app.post<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/approve', async (req, reply) => {
      const u = needRole(req, 'approver', 'operator_admin');
      const b = z.object({ signature: z.string(), signerAddress: z.string().nullable().optional(), simulateFailure: z.boolean().optional() }).parse(req.body);
      const r = await withIdempotency(deps.db, `approve:${req.params.runId}`, req.headers['idempotency-key'] as string | undefined, async () => ({ status: 200, body: await approveRun(deps, req.params.clientId, req.params.runId, { id: u.id, name: u.name }, b) }));
      if (!r.replayed) setTimeout(() => void worker.tick(), 10);
      reply.code(r.status); return r.body;
    });
    app.get<{ Params: { clientId: string } }>('/clients/:clientId/runs', async (req) => listRecords(deps, req.params.clientId));
    app.get<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId', async (req) => recordView(deps, req.params.clientId, req.params.runId));
    app.get<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/payouts', async (req) => (await recordView(deps, req.params.clientId, req.params.runId)).items.flatMap((i) => i.payouts));
    app.get<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/export', async (req, reply) => {
      const r = await recordView(deps, req.params.clientId, req.params.runId);
      const csv = accountingCsv({ ...r, items: r.items.map((i) => ({ ...i, payouts: i.payouts.map((p) => ({ ...p, option: p.option as PayoutOption })) })) } as never);
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${r.label.replace(/\s+/g, '-')}-payouts.csv"`);
      return csv;
    });
    app.post<{ Params: { clientId: string; payoutId: string } }>('/clients/:clientId/payouts/:payoutId/retry', async (req, reply) => {
      needRole(req, 'approver', 'preparer', 'operator_admin');
      const r = await withIdempotency(deps.db, `retry:${req.params.payoutId}`, req.headers['idempotency-key'] as string | undefined, async () => {
        try { const p = await retryPayout(deps.db, req.params.clientId, req.params.payoutId); return { status: 200, body: payoutJson(deps, p) }; }
        catch (e) { if ((e as Error).message === 'not_found') throw notFound('Payout'); if ((e as Error).message === 'not_failed') throw conflict('not_failed', 'Only a failed payout can be retried.'); throw e; }
      });
      if (!r.replayed) setTimeout(() => void worker.tick(), 10);
      reply.code(r.status); return r.body;
    });
    app.get<{ Params: { clientId: string; runId: string; personId: string } }>('/clients/:clientId/runs/:runId/payslips/:personId.pdf', async (req, reply) => {
      const buf = await payslipPdf(deps, req.params.clientId, req.params.runId, req.params.personId);
      reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="payslip-${req.params.runId}-${req.params.personId}.pdf"`);
      return buf;
    });
    app.get<{ Params: { clientId: string; runId: string; personId: string }; Querystring: { fields?: string } }>('/clients/:clientId/runs/:runId/payslips/:personId', async (req) => {
      const s = await getPayslip(deps.db, req.params.clientId, req.params.runId, req.params.personId);
      if (req.query.fields) return discloseFields(s, req.query.fields.split(',').map((x) => x.trim()).filter(Boolean));
      return { document: s.document, leaves: s.leaves, root: s.root, docHash: s.docHash, anchorTx: s.anchorTx, anchorId: s.anchorId, employerSignature: s.employerSignature, explorerUrl: s.anchorTx ? deps.chain.explorerTxUrl(s.anchorTx as never) : null };
    });

    // Non-custodial real path: the browser signs Sera.cx intents and sends the disbursement; the API records and polls.
    app.post<{ Params: { clientId: string; runId: string; payoutId: string } }>('/clients/:clientId/runs/:runId/swaps/:payoutId/submit', async (req) => {
      needRole(req, 'approver', 'operator_admin');
      if (!deps.sera) throw conflict('not_sera', 'SWAP_PROVIDER is not sera.');
      const b = z.object({ signature: z.string(), permitSignature: z.string().optional(), permitDeadline: z.number().optional(), uuid: z.string().optional() }).parse(req.body);
      const p = (await deps.db.select().from(payouts).where(and(eq(payouts.id, req.params.payoutId), eq(payouts.clientId, req.params.clientId), eq(payouts.runId, req.params.runId))).limit(1))[0];
      if (!p) throw notFound('Payout');
      if (p.swapTradeId) return { tradeId: p.swapTradeId, replayed: true };
      const run = (await recordView(deps, req.params.clientId, req.params.runId));
      const plan = run.chainPlan as { swaps?: { payoutId: string; quote?: { uuid: string } }[] } | undefined;
      const uuidv = b.uuid ?? plan?.swaps?.find((s) => s.payoutId === p.id)?.quote?.uuid;
      if (!uuidv) throw conflict('no_quote', 'No Sera.cx rate is on file for this payout. Approve the run again.');
      const { assetOf } = await import('@sera-payroll/core');
      const { tradeId } = await deps.sera.submitSigned(p.id, assetOf(p.option as PayoutOption), uuidv, b.signature as `0x${string}`, b.permitSignature as `0x${string}` | undefined, b.permitDeadline);
      await deps.db.update(payouts).set({ swapTradeId: tradeId, swapReference: uuidv }).where(eq(payouts.id, p.id));
      return { tradeId };
    });
    app.post<{ Params: { clientId: string; runId: string } }>('/clients/:clientId/runs/:runId/disburse', async (req) => {
      needRole(req, 'approver', 'operator_admin');
      const { txHash } = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(req.body);
      const { payRuns } = await import('@sera-payroll/db');
      const r = await deps.db.update(payRuns).set({ disburseTx: txHash }).where(and(eq(payRuns.id, req.params.runId), eq(payRuns.clientId, req.params.clientId))).returning({ id: payRuns.id });
      if (!r.length) throw notFound('Run');
      setTimeout(() => void worker.tick(), 10);
      return { ok: true, txHash };
    });

    app.get<{ Params: { clientId: string } }>('/clients/:clientId/outbox', async (req) => (await deps.db.select().from(notifications).where(eq(notifications.clientId, req.params.clientId)).orderBy(desc(notifications.sentAt)).limit(200)).map((m) => ({ id: m.id, at: m.sentAt, to: m.toName, toEmail: m.toEmail, subject: m.subject, kind: m.kind, provider: m.provider })));
    app.get<{ Params: { clientId: string }; Querystring: { limit?: string } }>('/clients/:clientId/audit', async (req) => (await deps.db.select().from(auditLog).where(eq(auditLog.clientId, req.params.clientId)).orderBy(desc(auditLog.at)).limit(Math.min(500, Number(req.query.limit ?? 100)))).map((a) => ({ at: a.at, actor: a.actor, action: a.action, subject: a.subject, detail: a.detail })));
  };
}
