import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { database, type Executor } from '../db/client';
import type { AppEnv } from '../lib/context';
import { publicOrigin } from '../lib/env';
import { AppError } from '../lib/errors';
import { clientIp, rateLimit, type RateLimit } from '../lib/rate-limit';
import { agent, type Agent } from './agent';
import { auth, type Auth } from './auth';
import { oauthRoutes } from './oauth-routes';

/**
 * `/api/auth/*` (architecture §7.1, §7.2): Better Auth's email and password endpoints, with
 * `core.rate_limit`'s limits in front (§8), and the agents' OAuth server (`oauthRoutes`). Only the
 * endpoints listed here are served; Better Auth's others (updating a name, linking accounts, the
 * OAuth provider's consent and admin endpoints…) answer `NOT_FOUND`. Google and Apple add
 * `/sign-in/social` (limited like a sign-up: starting one is a way in) and `/callback/:id`, which
 * the providers answer to (Apple by form POST); the callback carries no limit of its own, because
 * only a state this server minted completes it.
 */

/** Sign-up: per IP address, in a fixed one-minute window (§8). */
export const SIGN_UPS_PER_MINUTE = 5;
/** Sign-in: per IP address and email together (§8). */
export const SIGN_INS_PER_MINUTE = 10;
/** Asking for a reset or another verification email: per IP address. Each one is an email sent. */
export const EMAIL_REQUESTS_PER_MINUTE = 5;

const MAX_EMAIL_LENGTH = 320;

/** An email, a password and a time zone, or a token and a new password: never more than this. */
const MAX_BODY_BYTES = 4096;

const smallBody = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new AppError('VALIDATION_FAILED', `Send at most ${MAX_BODY_BYTES} bytes.`, {
      fields: { body: `Send at most ${MAX_BODY_BYTES} bytes.` },
    });
  },
});

export interface AuthRoutesDeps {
  auth: () => Auth;
  rateLimit: RateLimit;
  /** NetNet's origin, where the approval page is. */
  origin: () => string;
  agent: () => Agent;
  /** Connected as `netnet_app`. */
  db: () => Executor;
}

const defaultDeps: AuthRoutesDeps = {
  auth,
  rateLimit,
  origin: publicOrigin,
  agent,
  db: database,
};

/** The request's body as an object, read from a copy so Better Auth can still read the original. */
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const text = await request.clone().text();
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Better Auth also takes a form; anything else it refuses itself.
    return Object.fromEntries(new URLSearchParams(text));
  }
}

/** The email a sign-in is for, as the limit's key: lowercase, as accounts store it. */
async function emailOf(request: Request): Promise<string> {
  const { email } = await bodyOf(request);
  return typeof email === 'string' ? email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : '';
}

/**
 * Sign-up asks for no name (PRD J1), but Better Auth's endpoint requires one: an empty name is
 * filled in, and the user hook keeps it empty whatever is sent.
 */
async function withEmptyName(request: Request): Promise<Request> {
  const text = await request.clone().text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return request;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body) || 'name' in body) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ ...body, name: '' }),
  });
}

export function authRoutes(deps: AuthRoutesDeps = defaultDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const pass = (c: Context<AppEnv>) => deps.auth().handler(c.req.raw);
  const perIp = (c: Context<AppEnv>, what: string, limit: number) =>
    deps.rateLimit(`${what}:ip:${clientIp(c)}`, limit, 60);

  routes.post('/sign-up/email', smallBody, async (c) => {
    await perIp(c, 'signup', SIGN_UPS_PER_MINUTE);
    return deps.auth().handler(await withEmptyName(c.req.raw));
  });

  routes.post('/sign-in/email', smallBody, async (c) => {
    const email = await emailOf(c.req.raw);
    await deps.rateLimit(`signin:${clientIp(c)}:${email}`, SIGN_INS_PER_MINUTE, 60);
    return pass(c);
  });

  routes.post('/sign-in/social', smallBody, async (c) => {
    await perIp(c, 'social', SIGN_UPS_PER_MINUTE);
    return pass(c);
  });

  // The providers' answer, not ours: no body limit of ours applies to their POST.
  routes.get('/callback/:id', pass);
  routes.post('/callback/:id', pass);

  routes.post('/request-password-reset', smallBody, async (c) => {
    await perIp(c, 'reset', EMAIL_REQUESTS_PER_MINUTE);
    return pass(c);
  });

  routes.post('/send-verification-email', smallBody, async (c) => {
    await perIp(c, 'verify', EMAIL_REQUESTS_PER_MINUTE);
    return pass(c);
  });

  routes.get('/verify-email', pass);
  routes.get('/reset-password/:token', pass);
  routes.post('/reset-password', smallBody, pass);
  routes.post('/sign-out', smallBody, pass);
  routes.get('/get-session', pass);

  routes.route('/', oauthRoutes(deps));

  return routes;
}
