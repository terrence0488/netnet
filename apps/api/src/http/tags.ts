import { tagInputSchema, type TagInput } from '@netnet/contracts';
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
 * The person's tags over REST (architecture §7.2, PRD J2): `POST /api/tags` makes one (`{name}`),
 * `PATCH /api/tags/:id` renames it, `DELETE /api/tags/:id` deletes it, or merges it with
 * `?mergeInto=`. Holdings that carried it lose it or carry the other; saved filters follow.
 */

export function tagsRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const body = await readObject(c);
    validate(tagInputSchema, body, (errors) =>
      refuseKey(body, 'id', 'Remove it: POST makes a new tag; rename one with PATCH.', errors),
    );
    return c.json(await writeLedger(c, deps, userId, (l) => l.upsertTag(body as TagInput)));
  });

  routes.patch('/:id', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'tag', 'tag');
    const body = await readObject(c);
    const input = { ...body, id } as TagInput;
    validate(tagInputSchema, input, (errors) =>
      refuseKey(body, 'id', 'Remove it: the tag is the one in the path.', errors),
    );
    return c.json(await writeLedger(c, deps, userId, (l) => l.upsertTag(input)));
  });

  routes.delete('/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'tag', 'tag');
    const mergeInto = queryId(c.req.query('mergeInto'), 'mergeInto', 'tag', 'tag');
    return c.json(await writeLedger(c, deps, userId, (l) => l.deleteTag(id, mergeInto)));
  });

  return routes;
}
