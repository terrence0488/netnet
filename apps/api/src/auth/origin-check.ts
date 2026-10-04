import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';

/**
 * The Origin check on state-changing requests (architecture §8), for every `/api/*` route: with
 * `SameSite=Lax` cookies it is the second guard against a request forged by another site. `/mcp`
 * and `/.well-known/*` are not checked: agents reach them with bearer tokens, never cookies.
 *
 * A browser sends `Origin` with every POST, PUT, PATCH and DELETE, so one that names another site
 * (or `null`) is refused. Without `Origin`, a request that the browser's Fetch Metadata says came
 * from another site is refused too; one with neither header did not come from a browser (an
 * agent's server, a script) and carries no ambient cookie to abuse, so it passes.
 *
 * The agents' token, registration and revocation endpoints are not checked either: their routes
 * drop any cookie, so another site can forge nothing there, and a browser-based agent calls them
 * from its own origin.
 */

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const CHECKED = /^\/api(\/|$)/;

const COOKIELESS = /^\/api\/auth\/oauth2\/(token|register|revoke)$/;

/** `Sec-Fetch-Site` values a request from NetNet's own pages, or typed by the person, can have. */
const OWN_SITE = new Set(['same-origin', 'none']);

export function originCheck(trusted: () => readonly string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (
      STATE_CHANGING.has(c.req.method) &&
      CHECKED.test(c.req.path) &&
      !COOKIELESS.test(c.req.path)
    ) {
      const origin = c.req.header('Origin');
      const site = c.req.header('Sec-Fetch-Site');
      const allowed =
        origin !== undefined
          ? trusted().includes(origin)
          : site === undefined || OWN_SITE.has(site);
      if (!allowed) {
        // §7.5 has no code of its own for this; the request is not accepted as the person's.
        throw new AppError(
          'UNAUTHENTICATED',
          'This request came from another site, so it is not accepted. Send it from NetNet itself.',
        );
      }
    }
    await next();
  };
}
