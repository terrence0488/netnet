import type { MiddlewareHandler } from 'hono';
import { database, type Executor } from '../db/client';
import { touchChecked } from '../db/reminders';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';

export interface TouchCheckedDeps {
  db: () => Executor;
  clock: () => Date;
}

/**
 * `touchChecked` for the web (architecture §7.10): after any session-authenticated `/api/*`
 * request answers, the person's clock restarts from their today. It runs after the response, so
 * it adds no latency, and writes at most once per person per day. The reminder's own signed-link
 * routes are excluded: their tokens carry no session and do not count.
 */
export function touchCheckedOnSession(
  deps: TouchCheckedDeps = { db: database, clock: () => new Date() },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    if (new URL(c.req.url).pathname.startsWith('/api/reminders/')) return;
    afterResponse(
      c,
      (async () => {
        const session = await c.var.session();
        if (session !== null) await touchChecked(deps.db(), session.userId, deps.clock());
      })(),
    );
  };
}
