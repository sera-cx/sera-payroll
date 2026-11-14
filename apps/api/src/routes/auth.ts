import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { clients, sessions, users } from '@sera-payroll/db';
import type { Deps } from '../services/deps.js';
import { SESSION_COOKIE, consumeMagicLink, createSession, issueMagicLink, issueNonce, setSessionCookie, siweMessage, verifySiwe } from '../services/auth.js';
import { badRequest, notFound, unauthorized } from '../errors.js';

export function authRoutes(deps: Deps) {
  const secure = deps.config.WEB_ORIGIN.startsWith('https://');
  return async function (app: FastifyInstance) {
    app.get('/auth/demo/users', async () => {
      if (!deps.config.DEMO_MODE) throw notFound('Demo sign-in');
      const rows = await deps.db.select().from(users).orderBy(users.clientId, users.role, users.name);
      const names = new Map((await deps.db.select({ id: clients.id, name: clients.name }).from(clients)).map((c) => [c.id, c.name]));
      return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, clientId: u.clientId, operatorId: u.operatorId, personId: u.personId, clientName: u.clientId ? names.get(u.clientId) ?? null : null }));
    });
    app.post('/auth/demo', async (req, reply) => {
      if (!deps.config.DEMO_MODE) throw notFound('Demo sign-in');
      const { userId } = z.object({ userId: z.string() }).parse(req.body);
      const u = (await deps.db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
      if (!u) throw notFound('User');
      setSessionCookie(reply, await createSession(deps.db, u.id), secure);
      return { ok: true };
    });
    app.post('/auth/magic-link', async (req, reply) => {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const r = await issueMagicLink(deps.db, email);
      if (r) await deps.notifier.send({ email: r.user.email, name: r.user.name }, 'magic_link', { url: `${deps.config.WEB_ORIGIN.replace(/\/$/, '')}/api/v1/auth/callback?token=${r.token}` }, { operatorId: r.user.operatorId, clientId: r.user.clientId });
      reply.code(204); return null;
    });
    app.get('/auth/callback', async (req, reply) => {
      const { token } = z.object({ token: z.string() }).parse(req.query);
      const userId = await consumeMagicLink(deps.db, token);
      if (!userId) throw unauthorized('That sign-in link is not valid any more.');
      setSessionCookie(reply, await createSession(deps.db, userId), secure);
      return reply.redirect(deps.config.WEB_ORIGIN);
    });
    app.get('/auth/siwe/nonce', async () => ({ nonce: await issueNonce(deps.db, 'siwe', null), domain: new URL(deps.config.WEB_ORIGIN).host, example: siweMessage(new URL(deps.config.WEB_ORIGIN).host, '0x…', '<nonce>', new Date().toISOString()) }));
    app.post('/auth/siwe', async (req, reply) => {
      const { message, signature } = z.object({ message: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).parse(req.body);
      const u = await verifySiwe(deps.db, message, signature as `0x${string}`, new URL(deps.config.WEB_ORIGIN).host);
      if (!u) throw unauthorized('Signature, nonce or wallet not recognised.');
      setSessionCookie(reply, await createSession(deps.db, u.id), secure);
      return { ok: true };
    });
    // Signed out is not an error: the web app needs demoMode and the network before sign-in.
    app.get('/auth/me', async (req) => {
      return { user: req.user ?? null, demoMode: deps.config.DEMO_MODE, network: { name: deps.chain.network, chainId: deps.chain.chainId, explorer: deps.chain.explorerTxUrl('0x' as never).replace(/\/tx\/.*$/, '') }, brand: deps.config.BRAND, swapProvider: deps.swap.name };
    });
    app.post('/auth/logout', async (req, reply) => {
      const sid = req.cookies[SESSION_COOKIE];
      if (sid) await deps.db.delete(sessions).where(eq(sessions.id, sid));
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      reply.code(204); return null;
    });
    app.get('/health', async () => ({ ok: true, demoMode: deps.config.DEMO_MODE, chain: deps.config.CHAIN, swap: deps.swap.name }));
    void badRequest;
  };
}
