import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'pg' | 'pglite';
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** Postgres connection string. When missing, PGlite is used. */
  databaseUrl?: string;
  /** PGlite data directory. Ignored for Postgres. */
  pgliteDir?: string;
  /** In-memory PGlite (tests). */
  memory?: boolean;
}

/**
 * Postgres when DATABASE_URL is set, otherwise PGlite (Postgres compiled to WASM,
 * same SQL, same Drizzle schema) persisted at .pglite/ or in memory.
 */
export async function createDb(opts: CreateDbOptions = {}): Promise<DbHandle> {
  const url = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzle(pool, { schema }) as unknown as Db;
    return { db, kind: 'pg', close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const memory = opts.memory ?? process.env.PGLITE_MEMORY === '1';
  const client = memory ? new PGlite() : new PGlite(opts.pgliteDir ?? process.env.PGLITE_DIR ?? '.pglite');
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, kind: 'pglite', close: () => client.close() };
}

const migrationsFolder = new URL('../drizzle', import.meta.url).pathname;

export async function migrate(handle: DbHandle): Promise<void> {
  if (handle.kind === 'pg') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    await migrate(handle.db as never, { migrationsFolder });
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(handle.db as never, { migrationsFolder });
  }
}
