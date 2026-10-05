import { prefsPatchSchema, type PrefsPatch } from '@netnet/contracts';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import type { AppEnv } from '../lib/context';
import {
  appLedgerDeps,
  limitBody,
  readObject,
  validate,
  writeLedger,
  type LedgerDeps,
} from './ledger-edge';

/**
 * `PATCH /api/prefs` (architecture §7.2, PRD J4, J11): Home's and Insights' filters (exclusions
 * included), the baseline and the sort. Each key given is set, or cleared with `null`; the result
 * is the prefs that are set. Filters may name only the person's own ids.
 */
export function prefsRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().patch('/', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const body = await readObject(c);
    validate(prefsPatchSchema, body);
    return c.json(await writeLedger(c, deps, userId, (l) => l.setPrefs(body as PrefsPatch)));
  });
}
