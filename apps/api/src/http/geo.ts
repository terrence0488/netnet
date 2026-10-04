import type { Countries, Geo } from '@netnet/contracts';
import { Hono } from 'hono';
import type { AppEnv } from '../lib/context';

/**
 * `GET /api/geo` → `{country}` (architecture §7.2, PRD §2.3 rule 2): the country onboarding
 * suggests, then asks the person to confirm. It is Vercel's own IP lookup, the
 * `x-vercel-ip-country` header, never a third-party service. A code that is not on the country list
 * (or no header, as in local runs) is null, so nothing is suggested.
 */
const HEADER = 'x-vercel-ip-country';

export function geoRoutes(countries: () => Promise<Countries>): Hono<AppEnv> {
  return new Hono<AppEnv>().get('/', async (c) => {
    const code = c.req.header(HEADER) ?? '';
    const known = /^[A-Z]{2}$/.test(code) && Object.hasOwn(await countries(), code);
    const body: Geo = { country: known ? code : null };
    return c.json(body);
  });
}
