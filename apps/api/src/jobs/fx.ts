import type { Handler } from 'hono';
import { database } from '../db/client';
import { databaseRateStore, syncRecent, type SyncDeps, type SyncResult } from '../content/fx-sync';
import { FX_SOURCE_NAMES } from '../content/fx-sources';
import type { AppEnv } from '../lib/context';
import { log } from '../lib/log';
import { routeOf } from '../lib/request-context';

/**
 * `GET /api/cron/fx`, daily at 17:00 UTC, after the ECB publishes (architecture §9.3): fetches the
 * new day's rates, and any gap, from both sources. A source that fails is logged and its last rates
 * stay in use with their dates (§6.6, §10); the run then answers 502, so the cron shows it failed.
 */
export interface FxJobDeps {
  sync: (today: string) => Promise<SyncResult>;
  clock: () => Date;
}

/**
 * Per request, with one retry 2 s later: the two sources run side by side, so even both failing
 * slowly stays well inside the function's 300 s.
 */
const CRON_TIMEOUT_MS = 20_000;
const CRON_ATTEMPTS = 2;

export function fxJob({ sync, clock }: FxJobDeps): Handler<AppEnv> {
  return async (c) => {
    const today = clock().toISOString().slice(0, 10);
    const result = await sync(today);
    let failed = false;
    for (const source of FX_SOURCE_NAMES) {
      const outcome = result[source];
      if (outcome.ok) continue;
      failed = true;
      // The source's own status when it answered; 502 when it did not.
      log(`fx_${source}_fetch_failed`, {
        requestId: c.get('requestId'),
        route: routeOf(c),
        status: outcome.status ?? 502,
      });
    }
    return c.json(result, failed ? 502 : 200);
  };
}

/** The job as deployed: the real sources, the app's database, the real clock. */
export function defaultFxJob(): Handler<AppEnv> {
  const deps = (): SyncDeps => ({
    store: databaseRateStore(database()),
    fetch,
    timeoutMs: CRON_TIMEOUT_MS,
    attempts: CRON_ATTEMPTS,
  });
  return fxJob({ sync: (today) => syncRecent(today, deps()), clock: () => new Date() });
}
