import { randomBytes } from 'node:crypto';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { canonicalTimeZone } from '@netnet/contracts';
import { betterAuth, generateId } from 'better-auth';
import { createAuthMiddleware, createEmailVerificationToken } from 'better-auth/api';
import { authAdapter } from '../db/auth-adapter';
import { database, type Database } from '../db/client';
import { createProfile } from '../db/profiles';
import { createReminderState, todayInZone } from '../db/reminders';
import { socialProvidersFromEnv, type SocialConfig } from './social';
import { appVersion } from '../events/app-version';
import { track, type Track } from '../events/track';
import { inBackground } from '../lib/after-response';
import { appOrigins, publicOrigin } from '../lib/env';
import { newId } from '../lib/ids';
import { log } from '../lib/log';
import type { Notify } from '../notify/message';
import { notify } from '../notify/notify';
import { oauthPlugins } from './oauth';

/**
 * Accounts (architecture §4, §8): Better Auth 1.7.7 with email and password, its tables in `core`.
 * Sign-up asks for an email and a password and nothing else, signs the person in at once and sends
 * the verification email through `notify()`; the person carries on unverified (PRD J1). Google
 * and Apple are `socialProviders` entries (`./social`); their accounts arrive verified and skip
 * the email. The agents' OAuth server is its plugins (`./oauth`).
 */

const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

/** Web sessions last 30 days, sliding: each day of use moves the end (architecture §8). */
export const SESSION_DAYS = 30;

/** The session cookie's name, after its `__Secure-` prefix. */
export const SESSION_COOKIE = 'netnet.session_token';

export const MIN_PASSWORD_LENGTH = 8;

export interface AuthDeps {
  /** Connected as `netnet_app`. */
  db: Database;
  /** `BETTER_AUTH_SECRET`: signs the session cookie and the verification tokens. */
  secret: string;
  /** NetNet's origin; Better Auth lives at `/api/auth` under it. */
  origin: string;
  /** The origins a state-changing request may come from (see `appOrigins()`). */
  trustedOrigins: string[];
  notify: Notify;
  track: Track;
  appVersion: () => string;
  /** The clock sign-up dates the reminder's clock by. */
  clock: () => Date;
  /** Runs work after the response: the emails and the event. */
  background: (task: Promise<unknown>) => void;
  /** Fetches agents' CIMD documents (see `OAuthPluginOptions`). */
  fetchClientMetadata: ClientMetadataResourceFetch;
  /**
   * Google and Apple (`./social`). Left out, no provider is served: the sign-in and callback
   * endpoints answer "provider not found", and the email flow is untouched.
   */
  social?: SocialConfig;
}

/**
 * The endpoints whose JSON answer carries the session token beside the cookie: sign-up and sign-in
 * as `token`, get-session as `session.token`. The web app reads neither, and the cookie is HttpOnly
 * so that page script never holds the token; `withoutSessionToken` takes it out of the bodies.
 * Social sign-in answers a redirect URL, but its id-token branch answers a token too.
 */
const TOKEN_IN_BODY = new Set([
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/social',
  '/get-session',
]);

/** `body` without the session token, wherever these endpoints put it. */
export function withoutSessionToken(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const rest: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  delete rest.token;
  const { session } = rest;
  if (typeof session === 'object' && session !== null && !Array.isArray(session)) {
    const kept: Record<string, unknown> = { ...(session as Record<string, unknown>) };
    delete kept.token;
    rest.session = kept;
  }
  return rest;
}

/** How the account was made: by the path that made it (`/callback/:id` for Google and Apple). */
function signUpMethod(params: unknown): 'email' | 'google' | 'apple' {
  const provider = (params as { id?: unknown } | undefined)?.id;
  return provider === 'google' || provider === 'apple' ? provider : 'email';
}

/** The browser's time zone sent with the sign-up (`timeZone`), or `UTC` without a valid one. */
function signUpTimeZone(body: unknown): string {
  const value = (body as { timeZone?: unknown } | undefined)?.timeZone;
  return (typeof value === 'string' && canonicalTimeZone(value)) || 'UTC';
}

export function createAuth(deps: AuthDeps) {
  const sendVerification = (userId: string, token: string) =>
    deps.background(deps.notify(userId, { kind: 'account.verify_email', token }));

  return betterAuth({
    appName: 'NetNet',
    baseURL: deps.origin,
    basePath: '/api/auth',
    secret: deps.secret,
    database: authAdapter(deps.db),
    trustedOrigins: deps.trustedOrigins,
    telemetry: { enabled: false },
    plugins: oauthPlugins({ origin: deps.origin, fetchClientMetadata: deps.fetchClientMetadata }),
    // The JWT plugin's session-to-JWT endpoint: agents get their tokens from the OAuth server.
    disabledPaths: ['/token'],
    // core.rate_limit does it, across every function instance (routes.ts).
    rateLimit: { enabled: false },
    // Better Auth's messages can carry an email address: only that something failed is kept.
    logger: {
      log: (level) => {
        if (level === 'error') log('auth_error', { errorCode: 'INTERNAL' });
      },
    },
    socialProviders: {
      ...(deps.social?.google
        ? {
            google: {
              clientId: deps.social.google.clientId,
              clientSecret: deps.social.google.clientSecret,
            },
          }
        : {}),
      ...(deps.social?.apple
        ? {
            apple: {
              clientId: deps.social.apple.clientId,
              clientSecret: deps.social.apple.clientSecret,
            },
          }
        : {}),
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: HOUR_S,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, token }) => {
        deps.background(deps.notify(user.id, { kind: 'account.reset_password', token }));
        return Promise.resolve();
      },
    },
    emailVerification: {
      // The sign-up email goes from the user hook below, once sign-up's transaction has committed;
      // this sends the ones asked for again.
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: DAY_S,
      sendVerificationEmail: ({ user, token }) => {
        sendVerification(user.id, token);
        return Promise.resolve();
      },
    },
    session: { expiresIn: SESSION_DAYS * DAY_S, updateAge: DAY_S },
    hooks: {
      // A hook's answer replaces the endpoint's (Better Auth's `hooks.after`).
      after: createAuthMiddleware(async (ctx) => {
        const returned: unknown = ctx.context.returned;
        if (!TOKEN_IN_BODY.has(ctx.path) || typeof returned !== 'object' || returned === null) {
          return;
        }
        if (returned instanceof Error || returned instanceof Response) return;
        return ctx.json(withoutSessionToken(returned) as Record<string, unknown>);
      }),
    },
    advanced: {
      cookiePrefix: 'netnet',
      useSecureCookies: true,
      defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'lax' },
      ipAddress: { disableIpTracking: true },
      backgroundTasks: { handler: deps.background },
      database: {
        // Our ids for people, because `withUser` takes no other; Better Auth's for the rest.
        generateId: ({ model }) => (model === 'user' ? newId('usr') : generateId()),
      },
    },
    databaseHooks: {
      user: {
        create: {
          // NetNet asks for no name and keeps no picture, whatever a client or a provider sends.
          before: (user) => Promise.resolve({ data: { ...user, name: '', image: null } }),
          // After sign-up's transaction commits, so the account can be read from elsewhere.
          after: async (user, ctx) => {
            try {
              const timeZone = signUpTimeZone(ctx?.body);
              await createProfile(deps.db, user.id, timeZone);
              // Signing up counts as a check: the first reminder is due in 30 days. A failure
              // here is repaired by the first `touchChecked`, which makes the row.
              await createReminderState(deps.db, user.id, todayInZone(timeZone, deps.clock()));
            } catch {
              // GET /api/me makes the profile with its defaults; the sign-up itself succeeded.
              log('profile_create_failed', { userId: user.id, errorCode: 'INTERNAL' });
            }
            const method = signUpMethod(ctx?.params);
            deps.background(
              deps.track(
                'account_created',
                { method },
                { userId: user.id, segment: 'unknown', appVersion: deps.appVersion() },
              ),
            );
            if (method === 'email' && !user.emailVerified) {
              sendVerification(
                user.id,
                await createEmailVerificationToken(deps.secret, user.email, undefined, DAY_S),
              );
            }
          },
        },
      },
      session: {
        create: {
          // Neither the address nor the browser of a session is kept.
          before: (session) =>
            Promise.resolve({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * `BETTER_AUTH_SECRET`. A deployment refuses to run without it; a local run makes one for the
 * process, so local sessions end when the API restarts.
 */
function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? '';
  if (secret !== '') return secret;
  if ((process.env.VERCEL_ENV ?? '') !== '') throw new Error('BETTER_AUTH_SECRET is not set');
  log('auth_secret_ephemeral');
  return randomBytes(32).toString('hex');
}

let shared: Auth | undefined;

/** The running app's accounts. Built on first use, so nothing connects until a request needs it. */
export function auth(): Auth {
  shared ??= createAuth({
    db: database(),
    secret: authSecret(),
    origin: publicOrigin(),
    trustedOrigins: appOrigins(),
    notify,
    track,
    appVersion,
    clock: () => new Date(),
    background: (task) =>
      inBackground(task, () => log('auth_task_failed', { errorCode: 'INTERNAL' })),
    fetchClientMetadata: fetchClientMetadataResource,
    social: socialProvidersFromEnv(),
  });
  return shared;
}
