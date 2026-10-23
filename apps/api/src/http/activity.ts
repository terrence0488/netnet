import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import type { AppEnv } from '../lib/context';
import { appLedgerDeps, invalid, queryId, readLedger, type LedgerDeps } from './ledger-edge';

/**
 * The activity log over REST (architecture §7.2, PRD J7): `GET /api/activity` reads the audit
 * log newest first, optionally one agent turn. It is read only: nothing reverts an entry (§6.8).
 * Mounted at `/api/activity`.
 */

/** §7.2's page size for the activity log over REST. */
export const MAX_ACTIVITY_PAGE_REST = 100;

/** The `limit` query parameter: a whole number from 1 to MAX_ACTIVITY_PAGE_REST, or left out. */
function pageLimit(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const limit = /^[0-9]{1,4}$/.test(text) ? Number(text) : Number.NaN;
  if (!(limit >= 1 && limit <= MAX_ACTIVITY_PAGE_REST)) {
    throw invalid({ limit: `Give a whole number from 1 to ${MAX_ACTIVITY_PAGE_REST}.` });
  }
  return limit;
}

export function activityRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const { userId } = await requireSession(c);
    const limit = pageLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor');
    const batchId = queryId(c.req.query('batchId'), 'batchId', 'bat', 'batch');
    return c.json(
      await readLedger(deps, userId, (l) =>
        l.activity({
          ...(cursor === undefined ? {} : { cursor }),
          ...(limit === undefined ? {} : { limit }),
          ...(batchId === undefined ? {} : { batchId }),
        }),
      ),
    );
  });

  return routes;
}
