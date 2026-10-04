import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../lib/context';

/**
 * Every `/api/cron/*` route requires `Authorization: Bearer $CRON_SECRET` (CONVENTIONS §7, F9),
 * which Vercel Cron sends when the project has CRON_SECRET. With no secret set, nothing gets in.
 */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function cronAuth(secret: () => string | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const expected = secret();
    const given = c.req.header('Authorization') ?? '';
    // Hashing first makes the comparison constant-time whatever the lengths.
    const ok =
      expected !== undefined &&
      expected !== '' &&
      timingSafeEqual(digest(given), digest(`Bearer ${expected}`));
    if (!ok) {
      throw new HTTPException(401, {
        res: new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer' },
        }),
      });
    }
    await next();
  };
}

/** The deployment's CRON_SECRET, read on each request. */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}
