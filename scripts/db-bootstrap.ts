/**
 * `pnpm db:bootstrap`: creates the roles the migrations grant to and sets `netnet_app`'s password
 * (architecture §6.1). Runs as the owner, before `pnpm db:migrate`.
 *
 * Reads DATABASE_OWNER_URL (the owner's direct connection), NETNET_APP_DB_PASSWORD and, when set,
 * NETNET_METRICS_DB_PASSWORD (the metrics login; unset leaves `netnet_metrics` unable to log in).
 */
import { bootstrapRoles } from '@netnet/api/db/bootstrap';
import { withClient } from '@netnet/api/db/client';
import { requireEnv, run } from './db-env';

await run('db:bootstrap', async () => {
  const appPassword = requireEnv('NETNET_APP_DB_PASSWORD');
  const metricsPassword = process.env.NETNET_METRICS_DB_PASSWORD;
  await withClient(requireEnv('DATABASE_OWNER_URL'), (client) =>
    bootstrapRoles(client, { appPassword, metricsPassword }),
  );
  return metricsPassword ? 'roles ready, metrics login on' : 'roles ready';
});
