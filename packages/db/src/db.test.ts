import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, migrate } from './client.js';
import { seedSample } from './seed.js';
import * as t from './schema.js';

describe('db', () => {
  it('migrates, seeds and reads back on PGlite', async () => {
    const h = await createDb({ memory: true });
    await migrate(h);
    const s = await seedSample(h.db);
    expect(s.clientIds).toHaveLength(3);
    const people = await h.db.select().from(t.people).where(eq(t.people.clientId, 'client-studio'));
    expect(people).toHaveLength(5);
    const runs = await h.db.select().from(t.payRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('complete');
    const pays = await h.db.select().from(t.payouts);
    expect(pays.length).toBeGreaterThan(3);
    // numeric comes back as a string
    expect(typeof people[0]!.monthlyPay).toBe('string');
    // reseed is idempotent
    await seedSample(h.db);
    expect(await h.db.select().from(t.operators)).toHaveLength(1);
    await h.close();
  });
});
