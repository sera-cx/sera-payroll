import { createDb, migrate, seedSample, type DbHandle } from '@sera-payroll/db';
import { privateKeyToAccount } from 'viem/accounts';
import { loadConfig, type Config } from '../config.js';
import { createDeps, type Deps } from '../services/deps.js';
import { buildApp, type App } from '../app.js';

export const approverKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const; // anvil #0, demo signer registered by the seed
export const approverAccount = privateKeyToAccount(approverKey);
export const employeeKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const; // anvil #1
export const employeeAccount = privateKeyToAccount(employeeKey);

export interface Harness extends App { deps: Deps; handle: DbHandle; clock: { now: Date }; as(userId: string): Promise<string>; get(url: string, cookie: string): Promise<{ status: number; body: any }>; send(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, cookie: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: any }>; close(): Promise<void> }

export async function harness(overrides: Partial<Config> = {}): Promise<Harness> {
  const handle = await createDb({ memory: true });
  await migrate(handle);
  await seedSample(handle.db);
  const config = loadConfig({}, { DEMO_MODE: true, WEBHOOK_RETRIES: 0, WORKER_INTERVAL_MS: 50, SESSION_SECRET: 'test-secret-test-secret-test-secret', ...overrides });
  const clock = { now: new Date('2026-11-15T12:00:00Z') };
  const deps = await createDeps(config, handle, { now: () => clock.now });
  const app = await buildApp(deps, { startWorker: false });
  const parse = (r: { statusCode: number; body: string; headers: Record<string, unknown> }) => { let body: any = r.body; try { body = JSON.parse(r.body); } catch { /* text */ } return { status: r.statusCode, body, headers: r.headers }; };
  const h: Harness = {
    ...app, deps, handle, clock,
    async as(userId) { const r = await app.app.inject({ method: 'POST', url: '/v1/auth/demo', payload: { userId } }); const c = r.cookies.find((x) => x.name === 'sp_session'); if (!c) throw new Error('no session ' + r.body); return `sp_session=${c.value}`; },
    async get(url, cookie) { return parse(await app.app.inject({ method: 'GET', url: '/v1' + url, headers: { cookie } })); },
    async send(method, url, cookie, body, headers = {}) { return parse(await app.app.inject({ method, url: '/v1' + url, headers: { cookie, ...headers }, payload: body as never })); },
    async close() { await app.stop(); await handle.close(); },
  };
  return h;
}
