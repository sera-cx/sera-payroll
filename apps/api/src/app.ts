import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { AddressRuleError, RunRuleError } from '@sera-payroll/core';
import { HttpError } from './errors.js';
import type { Deps } from './services/deps.js';
import { resolveUser } from './services/auth.js';
import { PayoutWorker } from './services/worker.js';
import { applyDueChanges } from './services/people.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/clients.js';
import { meRoutes } from './routes/me.js';
import { operatorRoutes } from './routes/operator.js';

export interface App { app: FastifyInstance; worker: PayoutWorker; stop(): Promise<void> }

export async function buildApp(deps: Deps, opts: { logger?: boolean; startWorker?: boolean } = {}): Promise<App> {
  const app = Fastify({ logger: opts.logger ? { level: deps.config.LOG_LEVEL } : false });
  await app.register(cors, { origin: [deps.config.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true });
  await app.register(cookie, { secret: deps.config.SESSION_SECRET });
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => { req.user = await resolveUser(deps.db, req); });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ZodError) return reply.code(400).send({ error: { code: 'validation', message: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') } });
    if (err instanceof RunRuleError) return reply.code(409).send({ error: { code: err.code, message: err.message } });
    if (err instanceof AddressRuleError) return reply.code(err.code === 'locked' ? 409 : 400).send({ error: { code: err.code, message: err.message } });
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: { code: e.code ?? 'bad_request', message: e.message ?? 'Bad request' } });
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'No such route.' } }));
  const worker = new PayoutWorker(deps);
  await app.register(async (v1) => {
    await v1.register(authRoutes(deps));
    await v1.register(clientRoutes(deps, worker));
    await v1.register(meRoutes(deps));
    await v1.register(operatorRoutes(deps));
  }, { prefix: '/v1' });
  let holdTimer: NodeJS.Timeout | null = null;
  if (opts.startWorker) {
    worker.start();
    holdTimer = setInterval(() => { void applyDueChanges(deps).catch((e) => app.log.error(e)); }, 60_000);
    holdTimer.unref?.();
  }
  return { app, worker, stop: async () => { worker.stop(); if (holdTimer) clearInterval(holdTimer); await app.close(); } };
}
