import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { Executor } from '../db/client';
import { codeGrant } from '../db/oauth';
import { afterResponse } from '../lib/after-response';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { clientIp, type RateLimit } from '../lib/rate-limit';
import type { Agent } from './agent';
import type { Auth } from './auth';
import { APPROVAL_PAGE, hashToken } from './oauth';

/**
 * The agents' OAuth endpoints, at Better Auth's own paths (architecture §7.1, §7.6):
 * `/api/auth/oauth2/authorize`, `/token`, `/register` (DCR), `/revoke`, and `/api/auth/jwks`;
 * and the RFC 8414 and RFC 9728 metadata at the root's `/.well-known`.
 *
 * NetNet's own part around the library: `resource` is required; a browser's authorize request
 * gets a 302 where the library answers `{redirect, url}`; DCR is limited per IP; the token, DCR
 * and revocation endpoints never act on a cookie; and the person's connection attempt hears of the
 * agent's authorize request and of its code exchange (PRD J5).
 */

/** DCR: per IP address, in a fixed one-hour window (§8). */
export const REGISTRATIONS_PER_HOUR = 10;

/** A registration is a client's metadata; a token request a few parameters. */
const MAX_BODY_BYTES = 16 * 1024;

const smallBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new AppError('VALIDATION_FAILED', `Send at most ${MAX_BODY_BYTES} bytes.`, {
      fields: { body: `Send at most ${MAX_BODY_BYTES} bytes.` },
    });
  },
});

/**
 * An agent's server or a browser-based agent may call these from anywhere: they take no cookie,
 * so there is nothing for another site to forge (CORS without credentials).
 */
const anyOrigin = cors({
  origin: '*',
  allowMethods: ['GET', 'POST'],
  allowHeaders: ['Authorization', 'Content-Type', 'DPoP', 'MCP-Protocol-Version'],
  maxAge: 86_400,
});

/** Authorize errors that only ask for interaction (`prompt=none`), not a refusal of the request. */
const INTERACTION_REQUIRED = new Set([
  'login_required',
  'consent_required',
  'interaction_required',
  'account_selection_required',
]);

export interface OAuthRoutesDeps {
  auth: () => Auth;
  rateLimit: RateLimit;
  /** NetNet's origin, where the approval page is. */
  origin: () => string;
  agent: () => Agent;
  /** Connected as `netnet_app`: to find a code's grant before it is exchanged. */
  db: () => Executor;
}

/** `request` without its cookie, so Better Auth treats it as the agent's, never the person's. */
async function withoutCookie(request: Request): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.text();
  return new Request(request.url, { method: request.method, headers, body });
}

/**
 * Whether a DCR registration asks for back-channel logout: the library would then POST to a URL
 * the registrant chose whenever a session ends, which NetNet has no use for. CIMD documents cannot
 * ask for it (the library refuses them).
 */
async function asksForBackChannelLogout(request: Request): Promise<boolean> {
  try {
    const body: unknown = JSON.parse(await request.clone().text());
    return (
      typeof body === 'object' &&
      body !== null &&
      ('backchannel_logout_uri' in body || 'backchannel_logout_session_required' in body)
    );
  } catch {
    // Not JSON: the library refuses it itself.
    return false;
  }
}

/** A redirect with headers that can still be changed, carrying `from`'s cookies. */
function redirect(location: string, from?: Response): Response {
  const headers = new Headers();
  for (const cookie of from?.headers.getSetCookie() ?? []) headers.append('Set-Cookie', cookie);
  headers.set('Location', location);
  return new Response(null, { status: 302, headers });
}

/** Where a refused authorize request sends the browser: the approval page, which explains. */
function errorPage(origin: string, error: string, description: string): string {
  const query = new URLSearchParams({ error, error_description: description });
  return `${origin}${APPROVAL_PAGE}?${query.toString()}`;
}

/**
 * A browser must land on a page, never on JSON. The library answers a browser's authorize request
 * with JSON `{redirect: true, url}`, which a browser shows as text (the spike's first real run
 * stopped there), and a client it cannot resolve (a CIMD URL it refuses, say) with a JSON error. A
 * navigation cannot be told apart from a fetch where the function runs, so every such GET gets a
 * 302: to `url`, or to the approval page with the error. Better Auth's own error page becomes the
 * approval page too.
 */
async function asNavigation(response: Response, origin: string): Promise<Response> {
  let location = response.headers.get('Location');
  if ((response.headers.get('Content-Type') ?? '').includes('application/json')) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as {
      redirect?: unknown;
      url?: unknown;
      error?: unknown;
      error_description?: unknown;
    } | null;
    if (body?.redirect === true && typeof body.url === 'string') {
      location = body.url;
    } else if (typeof body?.error === 'string') {
      const description = typeof body.error_description === 'string' ? body.error_description : '';
      return redirect(errorPage(origin, body.error, description), response);
    }
  }
  if (location === null) return response;
  const target = new URL(location, origin);
  if (target.origin === origin && target.pathname === '/api/auth/error') {
    return redirect(
      errorPage(
        origin,
        target.searchParams.get('error') ?? 'invalid_request',
        target.searchParams.get('error_description') ?? '',
      ),
      response,
    );
  }
  return location === response.headers.get('Location') ? response : redirect(location, response);
}

export function oauthRoutes(deps: OAuthRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const pass = async (c: Context<AppEnv>) => deps.auth().handler(await withoutCookie(c.req.raw));

  routes.get('/oauth2/authorize', async (c) => {
    const origin = deps.origin();
    const response =
      new URL(c.req.url).searchParams.getAll('resource').length === 0
        ? redirect(errorPage(origin, 'invalid_target', 'The agent did not name the resource.'))
        : await asNavigation(await deps.auth().handler(c.req.raw), origin);
    const location = response.headers.get('Location');
    if (location === null) return response;
    const target = new URL(location, origin);
    const error = target.searchParams.get('error');
    const person = await c.var.session();
    if (person !== null) {
      const attempts = deps.agent().attempts;
      if (error !== null && !INTERACTION_REQUIRED.has(error)) {
        afterResponse(c, attempts.authorizeRefused(person.userId));
      } else if (target.origin === origin && target.pathname === APPROVAL_PAGE) {
        afterResponse(c, attempts.authorizeSeen(person.userId));
      }
    }
    return response;
  });

  routes.use('/oauth2/token', anyOrigin);
  routes.post('/oauth2/token', smallBody, async (c) => {
    const request = await withoutCookie(c.req.raw);
    const form = new URLSearchParams(await request.clone().text());
    const code = form.get('grant_type') === 'authorization_code' ? form.get('code') : null;
    const grant = code ? await codeGrant(deps.db(), hashToken(code)) : null;
    const response = await deps.auth().handler(request);
    if (grant) afterResponse(c, deps.agent().attempts.codeExchanged(grant, response.ok));
    return response;
  });

  routes.use('/oauth2/register', anyOrigin);
  routes.post('/oauth2/register', smallBody, async (c) => {
    await deps.rateLimit(`dcr:ip:${clientIp(c)}`, REGISTRATIONS_PER_HOUR, 60 * 60);
    if (await asksForBackChannelLogout(c.req.raw)) {
      return c.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'NetNet does not offer back-channel logout: leave it out.',
        },
        400,
      );
    }
    return pass(c);
  });

  routes.use('/oauth2/revoke', anyOrigin);
  routes.post('/oauth2/revoke', smallBody, pass);

  routes.use('/jwks', anyOrigin);
  routes.get('/jwks', pass);

  return routes;
}

/** `/.well-known/*`: Better Auth serves the metadata at the root, because its issuer is the origin. */
export function wellKnownRoutes(auth: () => Auth): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const pass = (c: Context<AppEnv>) => auth().handler(c.req.raw);
  routes.use('*', anyOrigin);
  routes.get('/oauth-authorization-server', pass);
  routes.get('/oauth-protected-resource', pass);
  routes.get('/oauth-protected-resource/mcp', pass);
  return routes;
}
