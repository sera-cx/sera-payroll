import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { D, FIAT, WEBHOOK_EVENTS, type Fiat } from '@sera-payroll/core';
import { apiKeys, clients, operators, people, plugins as pluginsT, webhookDeliveries, webhooks, seedSample } from '@sera-payroll/db';
import type { Deps } from '../services/deps.js';
import { createApiKey, requireRole } from '../services/auth.js';
import { loadOperator, loadPlugins, loadRamps, rampsJson, setRamp } from '../services/tenancy.js';
import { badRequest, notFound } from '../errors.js';
import { token, uuid } from '../ids.js';
import { audit } from '../services/audit.js';

export function operatorRoutes(deps: Deps) {
  return async function (app: FastifyInstance) {
    app.addHook('preHandler', async (req) => { requireRole(req, 'operator_admin'); });
    const opId = (req: { user: { operatorId: string } | null }) => req.user!.operatorId;

    app.get('/operator', async (req) => {
      const o = await loadOperator(deps.db, opId(req));
      const cs = await deps.db.select().from(clients).where(eq(clients.operatorId, o.id)).orderBy(clients.createdAt);
      const counts = await deps.db.select({ clientId: people.clientId, n: sql<number>`count(*)` }).from(people).groupBy(people.clientId);
      const countOf = (id: string) => Number(counts.find((x) => x.clientId === id)?.n ?? 0);
      return { id: o.id, name: o.name, brand: o.brand, settings: { addressHoldHours: o.settings.addressHoldHours, demoMode: deps.config.DEMO_MODE }, signerAddress: deps.signer.address, clients: cs.map((c) => ({ id: c.id, name: c.name, feePercent: D(c.feePercent).toString(), peopleCount: countOf(c.id), treasuryWallet: c.treasuryWallet, signers: c.signers, settings: c.settings })) };
    });
    app.patch('/operator', async (req) => {
      const b = z.object({ name: z.string().min(1).optional(), brand: z.string().min(1).optional(), addressHoldHours: z.number().int().min(1).max(24 * 30).optional() }).parse(req.body);
      const o = await loadOperator(deps.db, opId(req));
      await deps.db.update(operators).set({ ...(b.name ? { name: b.name } : {}), ...(b.brand ? { brand: b.brand } : {}), settings: { ...o.settings, ...(b.addressHoldHours ? { addressHoldHours: b.addressHoldHours } : {}) } }).where(eq(operators.id, o.id));
      await audit(deps.db, { operatorId: o.id, clientId: null, actor: req.user!.id, action: 'operator.settings_changed', detail: b });
      return loadOperator(deps.db, o.id);
    });
    app.post('/operator/clients', async (req, reply) => {
      const b = z.object({ name: z.string().min(1), feePercent: z.union([z.string(), z.number()]).transform(String).default('0.5') }).parse(req.body);
      const id = uuid();
      await deps.db.insert(clients).values({ id, operatorId: opId(req), name: b.name, feePercent: b.feePercent, settings: { twoPerson: true, multisig: false, schedule: 'Monthly on the 28th', gasPayer: 'employer', requireTestPayment: false }, signers: [], balances: deps.config.DEMO_MODE ? { USDT: '10000', USDC: '10000' } : {} });
      await audit(deps.db, { operatorId: opId(req), clientId: id, actor: req.user!.id, action: 'client.created', subject: id });
      reply.code(201);
      return (await deps.db.select().from(clients).where(eq(clients.id, id)))[0];
    });
    app.patch<{ Params: { clientId: string } }>('/operator/clients/:clientId', async (req) => {
      const b = z.object({ name: z.string().min(1).optional(), feePercent: z.union([z.string(), z.number()]).transform(String).optional(), treasuryWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(), signers: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).optional() }).parse(req.body);
      if (b.feePercent !== undefined && !(Number(b.feePercent) >= 0)) throw badRequest('bad_fee', 'Fee must be zero or more.');
      const r = await deps.db.update(clients).set(b).where(and(eq(clients.id, req.params.clientId), eq(clients.operatorId, opId(req)))).returning();
      if (!r.length) throw notFound('Client');
      await audit(deps.db, { operatorId: opId(req), clientId: req.params.clientId, actor: req.user!.id, action: 'client.changed', detail: b });
      return r[0];
    });
    app.get('/operator/ramps', async (req) => rampsJson(await loadRamps(deps.db, opId(req))));
    app.patch<{ Params: { currency: string } }>('/operator/ramps/:currency', async (req) => {
      const c = req.params.currency.toUpperCase() as Fiat;
      if (!FIAT.includes(c)) throw notFound('Currency');
      const b = z.object({ onRamp: z.boolean().optional(), offRamp: z.boolean().optional() }).parse(req.body);
      await setRamp(deps.db, opId(req), c, b);
      await audit(deps.db, { operatorId: opId(req), clientId: null, actor: req.user!.id, action: 'ramp.changed', subject: c, detail: b });
      return rampsJson(await loadRamps(deps.db, opId(req)));
    });
    app.get('/operator/plugins', async (req) => (await loadPlugins(deps.db, opId(req))).rows.map((r) => ({ currency: r.currency, country: r.country, enabled: r.enabled, plugin: r.plugin })));
    app.patch<{ Params: { currency: string } }>('/operator/plugins/:currency', async (req) => {
      const c = req.params.currency.toUpperCase();
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      const r = await deps.db.update(pluginsT).set({ enabled }).where(and(eq(pluginsT.operatorId, opId(req)), eq(pluginsT.currency, c))).returning();
      if (!r.length) throw notFound('Plug-in');
      await audit(deps.db, { operatorId: opId(req), clientId: null, actor: req.user!.id, action: 'plugin.changed', subject: c, detail: { enabled } });
      return (await loadPlugins(deps.db, opId(req))).plugins;
    });
    app.get('/operator/api-keys', async (req) => (await deps.db.select().from(apiKeys).where(eq(apiKeys.operatorId, opId(req))).orderBy(desc(apiKeys.createdAt))).map((k) => ({ id: k.id, label: k.label, prefix: k.prefix, createdAt: k.createdAt, revokedAt: k.revokedAt })));
    app.post('/operator/api-keys', async (req, reply) => {
      const { label } = z.object({ label: z.string().min(1) }).parse(req.body);
      const r = await createApiKey(deps.db, opId(req), label);
      await audit(deps.db, { operatorId: opId(req), clientId: null, actor: req.user!.id, action: 'api_key.created', subject: r.id });
      reply.code(201); return { id: r.id, label, key: r.key, createdAt: new Date() };
    });
    app.delete<{ Params: { id: string } }>('/operator/api-keys/:id', async (req, reply) => {
      const r = await deps.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.operatorId, opId(req)))).returning();
      if (!r.length) throw notFound('API key');
      reply.code(204); return null;
    });
    app.get('/operator/webhooks', async (req) => (await deps.db.select().from(webhooks).where(eq(webhooks.operatorId, opId(req)))).map((w) => ({ id: w.id, url: w.url, events: w.events, createdAt: w.createdAt })));
    app.post('/operator/webhooks', async (req, reply) => {
      const b = z.object({ url: z.string().url(), events: z.array(z.string()).min(1) }).parse(req.body);
      for (const e of b.events) if (e !== '*' && !(WEBHOOK_EVENTS as readonly string[]).includes(e)) throw badRequest('bad_event', `Unknown event ${e}.`);
      const id = uuid(), secret = `whsec_${token(24)}`;
      await deps.db.insert(webhooks).values({ id, operatorId: opId(req), url: b.url, events: b.events, secret });
      reply.code(201); return { id, url: b.url, events: b.events, secret };
    });
    app.delete<{ Params: { id: string } }>('/operator/webhooks/:id', async (req, reply) => {
      const r = await deps.db.delete(webhooks).where(and(eq(webhooks.id, req.params.id), eq(webhooks.operatorId, opId(req)))).returning();
      if (!r.length) throw notFound('Webhook');
      reply.code(204); return null;
    });
    app.get<{ Params: { id: string } }>('/operator/webhooks/:id/deliveries', async (req) => {
      const w = (await deps.db.select().from(webhooks).where(and(eq(webhooks.id, req.params.id), eq(webhooks.operatorId, opId(req)))).limit(1))[0];
      if (!w) throw notFound('Webhook');
      return (await deps.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, w.id)).orderBy(desc(webhookDeliveries.at)).limit(100)).map((d) => ({ at: d.at, event: d.event, status: d.status, responseCode: d.responseCode, attempts: d.attempts }));
    });
    app.post('/operator/demo/reset', async (req, reply) => {
      if (!deps.config.DEMO_MODE) throw notFound('Demo reset');
      await seedSample(deps.db, { brand: deps.config.BRAND, holdHours: deps.config.HOLD_HOURS });
      reply.code(204); return null;
    });
    app.get('/operator/people-count', async (req) => ({ count: (await deps.db.select({ n: sql<number>`count(*)` }).from(people).innerJoin(clients, eq(people.clientId, clients.id)).where(eq(clients.operatorId, opId(req))))[0]?.n ?? 0 }));
  };
}
