/**
 * `pnpm db:migrate`: applies apps/api/migrations as the owner (CONVENTIONS §10). In CI and
 * production only the migration step holds the owner's connection string.
 *
 * Reads DATABASE_OWNER_URL (the owner's direct connection, never the pooler).
 */
import { withClient } from '@netnet/api/db/client';
import { runMigrations } from '@netnet/api/db/migrate';
import { requireEnv, run } from './db-env';

await run('db:migrate', async () => {
  await withClient(requireEnv('DATABASE_OWNER_URL'), runMigrations);
  return 'migrations applied';
});
