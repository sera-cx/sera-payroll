import { createDb, migrate } from './client.js';
import { seedSample } from './seed.js';

const cmd = process.argv[2];
const handle = await createDb();
try {
  if (cmd === 'migrate') { await migrate(handle); console.log('Migrated.'); }
  else if (cmd === 'seed') { await migrate(handle); const s = await seedSample(handle.db); console.log(`Seeded ${s.clientIds.length} clients, ${s.userIds.length} users.`); }
  else { console.error('Usage: cli.ts migrate|seed'); process.exitCode = 1; }
} finally {
  await handle.close();
}
