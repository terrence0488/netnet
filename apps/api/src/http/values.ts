import {
  newValueSchema,
  valuePatchSchema,
  type NewValue,
  type Value,
  type ValuePatch,
  type Write,
} from '@netnet/contracts';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import { notFound } from '../ledger/input';
import type { Ledger } from '../ledger/ledger';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import {
  appLedgerDeps,
  invalid,
  limitBody,
  pathId,
  readLedger,
  readObject,
  refuseKey,
  renamePaths,
  validate,
  writeLedger,
  type LedgerDeps,
} from './ledger-edge';

/**
 * Values over REST (architecture §7.2, PRD J3, J4): `GET` and `POST /api/holdings/:id/values`,
 * `PATCH` and `DELETE /api/values/:id`. Mounted at `/api`. A new value for a date that already has
 * one replaces it, with the warning `SAME_DATE_REPLACED`; the result is the value as stored.
 */

/** §7.2's page size for a holding's values over REST (the Ledger allows up to 500). */
export const MAX_VALUES_PAGE_REST = 200;

/** The `limit` query parameter: a whole number from 1 to MAX_VALUES_PAGE_REST, or left out. */
function pageLimit(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const limit = /^[0-9]{1,4}$/.test(text) ? Number(text) : Number.NaN;
  if (!(limit >= 1 && limit <= MAX_VALUES_PAGE_REST)) {
    throw invalid({ limit: `Give a whole number from 1 to ${MAX_VALUES_PAGE_REST}.` });
  }
  return limit;
}

const ONE_VALUE = /^values\[0\]\.?/;

/**
 * One value through `recordValues`, which takes a list: its result is the value as stored, its
 * warnings lose the list's path, and its errors are named as the body names them (`amount`, not
 * `values[0].amount`). A holding that is not the person's is NOT_FOUND, as on every route.
 */
async function recordOne(l: Ledger, holdingId: string, item: NewValue): Promise<Write<Value>> {
  let write;
  try {
    write = await l.recordValues([item]);
  } catch (error) {
    if (error instanceof AppError && error.details?.fields?.['values[0].holdingId'] !== undefined) {
      throw notFound('holding', holdingId);
    }
    return renamePaths(error, (path) => path.replace(ONE_VALUE, ''));
  }
  const [first] = write.result;
  if (!first) throw new Error('recordValues() returned no result for its one item');
  return {
    ...write,
    result: first.value,
    warnings: write.warnings.map(({ code, message }) => ({ code, message })),
  };
}

export function valuesRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/holdings/:id/values', async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'hld', 'holding');
    const limit = pageLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor');
    const page = {
      ...(cursor === undefined ? {} : { cursor }),
      ...(limit === undefined ? {} : { limit }),
    };
    try {
      const holding = await readLedger(deps, userId, (l) => l.getHolding(id, page));
      return c.json(holding.values);
    } catch (error) {
      return renamePaths(error, (path) => path.replace(/^values\./, ''));
    }
  });

  routes.post('/holdings/:id/values', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const holdingId = pathId(c.req.param('id'), 'hld', 'holding');
    const body = await readObject(c);
    const item = { ...body, holdingId } as NewValue;
    validate(newValueSchema, item, (errors) =>
      refuseKey(body, 'holdingId', 'Remove it: the holding is the one in the path.', errors),
    );
    return c.json(await writeLedger(c, deps, userId, (l) => recordOne(l, holdingId, item)));
  });

  routes.patch('/values/:id', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'val', 'value');
    const body = await readObject(c);
    validate(valuePatchSchema, body);
    return c.json(await writeLedger(c, deps, userId, (l) => l.updateValue(id, body as ValuePatch)));
  });

  routes.delete('/values/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'val', 'value');
    return c.json(await writeLedger(c, deps, userId, (l) => l.deleteValue(id)));
  });

  return routes;
}
