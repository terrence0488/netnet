import { typeInputSchema, type TypeInput } from '@netnet/contracts';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import type { AppEnv } from '../lib/context';
import {
  appLedgerDeps,
  limitBody,
  pathId,
  queryId,
  readObject,
  refuseKey,
  validate,
  writeLedger,
  type LedgerDeps,
} from './ledger-edge';

/**
 * The person's types over REST (architecture §7.2, PRD J2): `POST /api/types` makes one
 * (`{name, universal}`), `PATCH /api/types/:id` renames it (`{name}`), `DELETE /api/types/:id`
 * deletes it, or merges it with `?moveTo=`, the type its holdings move to. Nothing is orphaned:
 * holdings and saved filters follow.
 */

export function typesRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const body = await readObject(c);
    validate(typeInputSchema, body, (errors) =>
      refuseKey(body, 'id', 'Remove it: POST makes a new type; rename one with PATCH.', errors),
    );
    return c.json(await writeLedger(c, deps, userId, (l) => l.upsertType(body as TypeInput)));
  });

  routes.patch('/:id', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'typ', 'type');
    const body = await readObject(c);
    const input = { ...body, id } as TypeInput;
    validate(typeInputSchema, input, (errors) =>
      refuseKey(body, 'id', 'Remove it: the type is the one in the path.', errors),
    );
    return c.json(await writeLedger(c, deps, userId, (l) => l.upsertType(input)));
  });

  routes.delete('/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'typ', 'type');
    const moveTo = queryId(c.req.query('moveTo'), 'moveTo', 'typ', 'type');
    return c.json(await writeLedger(c, deps, userId, (l) => l.deleteType(id, moveTo)));
  });

  return routes;
}
