import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { verifyMessage, type Address } from 'viem';
import { z } from 'zod';
import { PAYOUT_OPTIONS, SAMPLE_RATES, ccyOf, conv, fixed, isBank, isPayoutOption, type PayoutOption } from '@sera-payroll/core';
import { invites, payRuns, payouts, payslips, people, runLines, users } from '@sera-payroll/db';
import type { Deps } from '../services/deps.js';
import { consumeNonce, createSession, issueNonce, requireUser, setSessionCookie } from '../services/auth.js';
import { applyDueChanges, cancelPendingAddress, challengeFor, employeeSubmitAddress, getPersonRow, personView } from '../services/people.js';
import { loadRamps, loadTenant } from '../services/tenancy.js';
import { discloseFields, getPayslip, payslipPdf } from '../services/payslips.js';
import { payoutJson } from '../services/runs.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { audit } from '../services/audit.js';
import { uuid } from '../ids.js';

export function meRoutes(deps: Deps) {
  const secure = deps.config.WEB_ORIGIN.startsWith('https://');
  return async function (app: FastifyInstance) {
    const me = async (req: { user: ReturnType<typeof requireUser> | null }) => {
      const u = requireUser(req as never);
      if (u.role !== 'employee' || !u.personId || !u.clientId) throw forbidden('This view is for employees and contractors.');
      const t = await loadTenant(deps.db, u.clientId);
      return { u, t, personId: u.personId };
    };
    const full = async (clientId: string, personId: string) => {
      await applyDueChanges(deps, clientId);
      const t = await loadTenant(deps.db, clientId);
      const p = await personView(deps.db, clientId, personId);
      const r = await loadRamps(deps.db, t.operator.id);
      const rates = SAMPLE_RATES;
      return {
        ...p, client: { id: t.client.id, name: t.client.name, brand: t.operator.brand }, ramps: r.ramps, rates, holdHours: t.settings.addressHoldHours,
        payoutOptions: PAYOUT_OPTIONS.map((o) => { const ok = !isBank(o) || r.ramps[ccyOf(o)].offRamp; return { option: o, enabled: ok, reason: ok ? undefined : 'No off-ramp partner connected', estimate: fixed(conv(p.monthlyPay, p.currency, ccyOf(o), rates), ccyOf(o)) }; }),
        network: { name: deps.chain.network, chainId: deps.chain.chainId },
      };
    };

    app.get('/me', async (req) => { const { t, personId } = await me(req); return full(t.client.id, personId); });
    app.patch('/me/payout', async (req) => {
      const { t, personId } = await me(req);
      const b = z.object({ payoutPrimary: z.string().optional(), payoutSecondary: z.string().nullable().optional(), splitPercent: z.number().int().min(10).max(90).optional() }).parse(req.body);
      const r = await loadRamps(deps.db, t.operator.id);
      const check = (o: string) => { if (!isPayoutOption(o)) throw badRequest('bad_option', 'Unknown payout option.'); if (isBank(o) && !r.ramps[ccyOf(o)].offRamp) throw conflict('no_offramp', `No off-ramp partner is connected for ${ccyOf(o)}.`); return o as PayoutOption; };
      const { row } = await getPersonRow(deps.db, t.client.id, personId);
      const patch: Partial<typeof people.$inferInsert> = { setupDone: true, setupAt: row.setupAt ?? deps.now() };
      if (b.payoutPrimary) { patch.payoutPrimary = check(b.payoutPrimary); if (row.payoutSecondary === patch.payoutPrimary) patch.payoutSecondary = null; }
      if (b.payoutSecondary !== undefined) { patch.payoutSecondary = b.payoutSecondary === null ? null : check(b.payoutSecondary); if (b.payoutSecondary === null) patch.splitPercent = 100; else if (row.splitPercent === 100 && b.splitPercent === undefined) patch.splitPercent = 70; }
      if (b.splitPercent !== undefined) patch.splitPercent = b.splitPercent;
      await deps.db.update(people).set(patch).where(eq(people.id, personId));
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: personId, action: 'payout.preference_changed', subject: personId, detail: b });
      return full(t.client.id, personId);
    });
    app.get('/me/address/challenge', async (req) => {
      const { t, personId } = await me(req);
      const { address } = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).parse(req.query);
      const issuedAt = deps.now().toISOString();
      const nonce = await issueNonce(deps.db, 'address', personId, { address: address.toLowerCase(), issuedAt });
      return { message: challengeFor(t.operator.brand, personId, t.client.id, address, 'ethereum', nonce, issuedAt), nonce, issuedAt };
    });
    app.post('/me/address/sign', async (req) => {
      const { t, personId } = await me(req);
      const b = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), nonce: z.string() }).parse(req.body);
      const payload = await consumeNonce(deps.db, b.nonce, 'address', personId);
      if (!payload || payload.address !== b.address.toLowerCase()) throw unauthorized('That challenge is not valid. Ask for a new one.');
      const message = challengeFor(t.operator.brand, personId, t.client.id, b.address, 'ethereum', b.nonce, String(payload.issuedAt));
      const ok = await verifyMessage({ address: b.address as Address, message, signature: b.signature as `0x${string}` }).catch(() => false);
      if (!ok) throw unauthorized('The signature does not prove this address.');
      await employeeSubmitAddress(deps, t, personId, b.address, 'employee_signed', b.signature);
      return full(t.client.id, personId);
    });
    app.post('/me/address/paste', async (req) => {
      const { t, personId } = await me(req);
      const { address } = z.object({ address: z.string() }).parse(req.body);
      await employeeSubmitAddress(deps, t, personId, address, 'employee_pasted', null);
      return full(t.client.id, personId);
    });
    app.post('/me/address/cancel', async (req) => { const { t, personId } = await me(req); await cancelPendingAddress(deps, t, personId, personId); return full(t.client.id, personId); });
    app.post('/me/verification/start', async (req) => {
      const { t, personId } = await me(req);
      const { row } = await getPersonRow(deps.db, t.client.id, personId);
      const bankCcy = [row.payoutPrimary, row.payoutSecondary].filter((o): o is string => !!o && o.startsWith('bank:')).map((o) => o.slice(5))[0] ?? 'MYR';
      const ramp = deps.ramps[bankCcy as keyof typeof deps.ramps];
      const r = await ramp.startEmployeeVerification({ id: row.id, name: row.name }, `${deps.config.WEB_ORIGIN}/me?verified=1`);
      const status = await ramp.getVerificationStatus(r.partnerReference);
      await deps.db.update(people).set({ kycPartnerRef: r.partnerReference, kycStatus: status === 'verified' ? 'verified' : 'pending', setupDone: true, setupAt: row.setupAt ?? deps.now() }).where(eq(people.id, personId));
      await audit(deps.db, { operatorId: t.operator.id, clientId: t.client.id, actor: personId, action: 'kyc.started', subject: personId, detail: { partner: ramp.name, status } });
      return { url: r.url, status };
    });
    app.get('/me/verification', async (req) => {
      const { t, personId } = await me(req);
      const { row } = await getPersonRow(deps.db, t.client.id, personId);
      if (row.kycPartnerRef && row.kycStatus === 'pending') {
        const bankCcy = [row.payoutPrimary, row.payoutSecondary].filter((o): o is string => !!o && o.startsWith('bank:')).map((o) => o.slice(5))[0] ?? 'MYR';
        const st = await deps.ramps[bankCcy as keyof typeof deps.ramps].getVerificationStatus(row.kycPartnerRef);
        if (st !== row.kycStatus) await deps.db.update(people).set({ kycStatus: st === 'verified' ? 'verified' : st === 'rejected' ? 'rejected' : 'pending' }).where(eq(people.id, personId));
        return { status: st };
      }
      return { status: row.kycStatus };
    });
    app.get('/me/payslips', async (req) => {
      const { t, personId } = await me(req);
      const ls = await deps.db.select({ l: runLines, r: payRuns }).from(runLines).innerJoin(payRuns, eq(runLines.runId, payRuns.id)).where(and(eq(runLines.personId, personId), eq(runLines.clientId, t.client.id), inArray(payRuns.status, ['sent', 'complete']))).orderBy(desc(payRuns.sentAt), runLines.position);
      const ids = ls.map((x) => x.l.id);
      const ps = ids.length ? await deps.db.select().from(payouts).where(inArray(payouts.lineId, ids)).orderBy(payouts.position) : [];
      const slips = ids.length ? await deps.db.select().from(payslips).where(inArray(payslips.lineId, ids)) : [];
      return ls.map(({ l, r }) => {
        const s = slips.find((x) => x.lineId === l.id);
        const cur = l.currency as Parameters<typeof fixed>[1];
        return { runId: r.id, lineId: l.id, label: r.label, payday: r.payDate, kind: l.kind, currency: l.currency, gross: fixed(l.gross, cur), deduction: fixed(l.deduction, cur), net: fixed(l.net, cur), payouts: ps.filter((p) => p.lineId === l.id).map((p) => payoutJson(deps, p)), payslip: s ? { root: s.root, docHash: s.docHash, anchorTx: s.anchorTx, explorerUrl: s.anchorTx ? deps.chain.explorerTxUrl(s.anchorTx as never) : null } : null };
      });
    });
    app.get<{ Params: { runId: string } }>('/me/payslips/:runId.pdf', async (req, reply) => {
      const { t, personId } = await me(req);
      const buf = await payslipPdf(deps, t.client.id, req.params.runId, personId);
      reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="payslip-${req.params.runId}.pdf"`);
      return buf;
    });
    app.get<{ Params: { runId: string }; Querystring: { fields?: string } }>('/me/payslips/:runId/disclose', async (req) => {
      const { t, personId } = await me(req);
      const s = await getPayslip(deps.db, t.client.id, req.params.runId, personId);
      const names = (req.query.fields ?? 'net,payday').split(',').map((x) => x.trim()).filter(Boolean);
      return { ...discloseFields(s, names), explorerUrl: s.anchorTx ? deps.chain.explorerTxUrl(s.anchorTx as never) : null };
    });

    // Public invite flow
    app.get<{ Params: { token: string } }>('/invite/:token', async (req) => {
      const inv = (await deps.db.select().from(invites).where(eq(invites.token, req.params.token)).limit(1))[0];
      if (!inv || inv.expiresAt < deps.now()) throw notFound('Invite');
      const t = await loadTenant(deps.db, inv.clientId);
      const p = (await deps.db.select().from(people).where(eq(people.id, inv.personId)).limit(1))[0];
      if (!p) throw notFound('Invite');
      return { personName: p.name, clientName: t.client.name, brand: t.operator.brand, accepted: !!inv.acceptedAt };
    });
    app.post<{ Params: { token: string } }>('/invite/:token/accept', async (req, reply) => {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const inv = (await deps.db.select().from(invites).where(eq(invites.token, req.params.token)).limit(1))[0];
      if (!inv || inv.expiresAt < deps.now()) throw notFound('Invite');
      const t = await loadTenant(deps.db, inv.clientId);
      const p = (await deps.db.select().from(people).where(eq(people.id, inv.personId)).limit(1))[0];
      if (!p) throw notFound('Invite');
      let u = (await deps.db.select().from(users).where(eq(users.personId, p.id)).limit(1))[0];
      if (!u) {
        const clash = (await deps.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1))[0];
        if (clash) throw conflict('email_taken', 'That email already has an account. Sign in with a link instead.');
        const id = uuid();
        await deps.db.insert(users).values({ id, operatorId: t.operator.id, clientId: t.client.id, personId: p.id, role: 'employee', email: email.toLowerCase(), name: p.name });
        u = (await deps.db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
      }
      await deps.db.update(people).set({ email: email.toLowerCase() }).where(eq(people.id, p.id));
      await deps.db.update(invites).set({ acceptedAt: deps.now() }).where(eq(invites.token, req.params.token));
      setSessionCookie(reply, await createSession(deps.db, u.id), secure);
      return { ok: true, userId: u.id };
    });
  };
}
