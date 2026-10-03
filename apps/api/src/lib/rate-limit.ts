import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { database } from '../db/client';
import { countHit } from '../db/rate-limits';
import { AppError } from './errors';

/**
 * Fixed-window rate limits over `core.rate_limit` (architecture §8). The counters live in the
 * database, so a limit holds across every function instance. A key names what is limited and for
 * whom (`events:ip:<address>`); it is stored as its SHA-256, so the table never holds an IP
 * address or an email.
 */

export interface RateLimitDeps {
  /** Adds one hit to `key`'s window and returns the window's count, this hit included. */
  count: (key: string, windowStart: Date) => Promise<number>;
  clock: () => Date;
}

/**
 * Counts one request against `limit` per `windowS` seconds for `key`. Resolves when it is
 * allowed; otherwise throws `RATE_LIMITED` with `retry_after_s`, the seconds until the window
 * ends (architecture §7.5).
 */
export type RateLimit = (key: string, limit: number, windowS: number) => Promise<void>;

function storedKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Builds `rateLimit` over a given counter and clock. The app uses `rateLimit` below. */
export function createRateLimit(deps: () => RateLimitDeps): RateLimit {
  return async (key, limit, windowS) => {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowS) || windowS < 1) {
      throw new RangeError('rateLimit(): limit and windowS must be whole numbers from 1');
    }
    const { count, clock } = deps();
    const now = clock().getTime();
    const windowMs = windowS * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const hits = await count(storedKey(key), new Date(windowStart));
    if (hits > limit) {
      const retryAfterS = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
      throw new AppError(
        'RATE_LIMITED',
        `Too many requests. Wait ${retryAfterS} s before trying again.`,
        { retry_after_s: retryAfterS },
      );
    }
  };
}

export const rateLimit: RateLimit = createRateLimit(() => ({
  count: (key, windowStart) => countHit(database(), key, windowStart),
  clock: () => new Date(),
}));

const MAX_IP_LENGTH = 64;

/**
 * The caller's IP address, for limits per IP. On Vercel, `x-real-ip` and `x-forwarded-for` are set
 * by the platform, which overwrites whatever the client sent; locally they are whatever the client
 * sent. Without either, every such request shares the `unknown` key.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0];
  const ip = (c.req.header('x-real-ip') ?? forwarded ?? '').trim();
  return ip === '' ? 'unknown' : ip.slice(0, MAX_IP_LENGTH);
}
