import { createDb, migrate, seedSample } from '@sera-payroll/db';
import { loadConfig } from './config.js';
import { createDeps } from './services/deps.js';
import { buildApp } from './app.js';

const config = loadConfig();
const handle = await createDb({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
await migrate(handle);
if (config.SEED_ON_START) {
  const { operators } = await import('@sera-payroll/db');
  const existing = await handle.db.select().from(operators).limit(1);
  if (!existing.length || process.env.RESEED === '1') { await seedSample(handle.db, { brand: config.BRAND, holdHours: config.HOLD_HOURS }); console.log('Seeded sample data.'); }
}
const deps = await createDeps(config, handle);
const { app, stop } = await buildApp(deps, { logger: true, startWorker: true });
await app.listen({ port: config.PORT, host: '0.0.0.0' });
console.log(`Sera.cx Payroll API on http://localhost:${config.PORT}/v1  demo=${config.DEMO_MODE} chain=${config.CHAIN} swap=${deps.swap.name} db=${handle.kind}`);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void stop().then(() => handle.close()).finally(() => process.exit(0)); });
