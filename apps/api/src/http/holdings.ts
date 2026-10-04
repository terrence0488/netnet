import {
  VIAS,
  createHoldingSchema,
  holdingPatchSchema,
  type CreateHolding,
  type HoldingPatch,
} from '@netnet/contracts';
import { Hono } from 'hono';
import { requireSession } from '../auth/session';
import type { AppEnv } from '../lib/context';
import {
  appLedgerDeps,
  limitBody,
  pathId,
  readObject,
  validate,
  writeLedger,
  type LedgerDeps,
} from './ledger-edge';

/**
 * Holdings over REST (architecture §7.2, PRD J1, J2, J6): `POST /api/holdings`, `PATCH` and
 * `DELETE /api/holdings/:id`. A holding's values are in values.ts. The body is the Ledger's own
 * input (`createHoldingSchema`, `holdingPatchSchema`); the web app must say which Add flow made a
 * holding (`via`), for `holding_created {source: web, via}`.
 */

const VIA_REQUIRED = `Say which Add flow made it: ${VIAS.map((v) => `"${v}"`).join(' or ')}.`;

export function holdingsRoutes(deps: LedgerDeps = appLedgerDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const body = await readObject(c);
    validate(createHoldingSchema, body, (errors) => {
      if (body.via === undefined) errors.add('VALIDATION_FAILED', 'via', VIA_REQUIRED);
    });
    return c.json(
      await writeLedger(c, deps, userId, (l) => l.createHolding(body as CreateHolding)),
    );
  });

  routes.patch('/:id', limitBody(), async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'hld', 'holding');
    const body = await readObject(c);
    validate(holdingPatchSchema, body);
    return c.json(
      await writeLedger(c, deps, userId, (l) => l.updateHolding(id, body as HoldingPatch)),
    );
  });

  routes.delete('/:id', async (c) => {
    const { userId } = await requireSession(c);
    const id = pathId(c.req.param('id'), 'hld', 'holding');
    return c.json(await writeLedger(c, deps, userId, (l) => l.deleteHolding(id)));
  });

  return routes;
}
