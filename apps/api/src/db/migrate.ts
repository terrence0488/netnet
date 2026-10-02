import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import type { Client, PoolClient } from 'pg';
import { ROLES } from './bootstrap';

/** drizzle-kit's migrations for every schema, row-level security and grants included. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Serialises concurrent runs (two CI runs for one preview branch, say). */
const LOCK_KEY = 'netnet.db.migrate';

/**
 * Applies every pending migration in one transaction, as the owner (`netnet_owner`; CI only), on a
 * direct connection: a session lock does not survive a transaction pooler. The roles must exist
 * first, because the migrations grant to them.
 */
export async function runMigrations(client: Client | PoolClient): Promise<void> {
  const { rows } = await client.query<{ rolname: string }>(
    'select rolname from pg_roles where rolname = any($1)',
    [ROLES],
  );
  const missing = ROLES.filter((role) => !rows.some((r) => r.rolname === role));
  if (missing.length > 0) {
    throw new Error(`Role ${missing.join(', ')} is missing: run \`pnpm db:bootstrap\` first.`);
  }
  await client.query('select pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
  }
}
