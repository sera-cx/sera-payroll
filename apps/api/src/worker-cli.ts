import { createDb, migrate } from '@sera-payroll/db';
import { loadConfig } from './config.js';
import { createDeps } from './services/deps.js';
import { PayoutWorker } from './services/worker.js';
import { applyDueChanges } from './services/people.js';

const config = loadConfig();
const handle = await createDb({ databaseUrl: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
await migrate(handle);
const deps = await createDeps(config, handle);
const worker = new PayoutWorker(deps);
worker.start();
setInterval(() => { void applyDueChanges(deps); }, 60_000);
console.log(`Payout worker running every ${config.WORKER_INTERVAL_MS} ms.`);
