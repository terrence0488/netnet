import { exportFormatSchema } from '@netnet/contracts';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import { toCsv } from '../ledger/export';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { appLedgerDeps, readLedger, type LedgerDeps } from './ledger-edge';

/**
 * `GET /api/export?format=json|csv` (architecture §7.2, PRD J10): the person's data to take away.
 * JSON is the full bundle — holdings, types, tags, accessibility with the answer behind it, every
 * value with its currency, rate and rate date. CSV is one flat values table. The user is the
 * session's, never one named in the request (CONVENTIONS §3).
 */
export function exportRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', async (c) => {
    const { userId } = await requireSession(c);
    const format = exportFormatSchema.safeParse(
      new URL(c.req.url).searchParams.get('format') ?? 'json',
    );
    if (!format.success) {
      throw new AppError('VALIDATION_FAILED', 'format: send "json" or "csv", or leave it out.', {
        fields: { format: 'Send "json" or "csv", or leave it out.' },
      });
    }
    const bundle = await readLedger(deps, userId, (ledger) => ledger.exportAll());
    if (format.data === 'csv') {
      return c.body(toCsv(bundle), 200, { 'Content-Type': 'text/csv; charset=utf-8' });
    }
    return c.json(bundle);
  });
}
