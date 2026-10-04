import type { Context } from 'hono';
import type { AppEnv } from '../lib/context';
import { AppError } from '../lib/errors';
import { isId } from '../lib/ids';
import type { ResolveSession } from '../lib/session';
import { SESSION_COOKIE, type Auth } from './auth';

/**
 * The web session (architecture §8): Better Auth's signed, HttpOnly cookie. `requireSession` is
 * where a route gets the user id it may give `withUser` (CONVENTIONS §3); an agent's token is the
 * only other source (P1-T13).
 */

/**
 * Reads the session cookie through Better Auth: the person, or null. A request without the cookie
 * never touches Better Auth or the database. When the session's end moves (once a day of use), the
 * refreshed cookie goes out with the response, so the browser's copy slides too.
 */
export function sessionFromCookie(auth: () => Auth): ResolveSession {
  return async (c) => {
    if (!(c.req.header('Cookie') ?? '').includes(SESSION_COOKIE)) return null;
    const { headers, response } = await auth().api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
    if (!response || !isId(response.user.id, 'usr')) return null;
    return { userId: response.user.id, emailVerified: response.user.emailVerified };
  };
}

export interface VerifiedSession {
  userId: string;
  emailVerified: boolean;
}

/** The signed-in person, or `UNAUTHENTICATED`, which sends the web app to sign in. */
export async function requireSession(c: Context<AppEnv>): Promise<VerifiedSession> {
  const user = await c.var.session();
  if (user === null) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first: this needs a signed-in session.');
  }
  return { userId: user.userId, emailVerified: user.emailVerified };
}

/**
 * The signed-in person with a verified email, or `EMAIL_NOT_VERIFIED`. Unverified people can do
 * everything else; only starting an agent connection needs it (PRD J1, J5).
 */
export async function requireVerifiedEmail(c: Context<AppEnv>): Promise<VerifiedSession> {
  const session = await requireSession(c);
  if (!session.emailVerified) {
    throw new AppError(
      'EMAIL_NOT_VERIFIED',
      'Verify your email first: open the link we sent, or ask for a new one.',
    );
  }
  return session;
}
