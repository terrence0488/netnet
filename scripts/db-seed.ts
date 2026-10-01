/**
 * `pnpm db:seed`: fictional data for a preview or a local database. Runs as `netnet_app`, like the
 * app, so the grants and row-level security apply to it too.
 *
 * Reads DATABASE_URL (the app's connection string).
 */
import { createDatabase, createPool } from '@netnet/api/db/client';
import { seed } from '@netnet/api/db/seed';
import { requireEnv, run } from './db-env';

await run('db:seed', async () => {
  const pool = createPool(requireEnv('DATABASE_URL'));
  try {
    await seed(createDatabase(pool));
  } finally {
    await pool.end();
  }
  return 'fictional data seeded';
});
