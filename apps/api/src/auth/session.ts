import type { Context } from 'hono';
import type { AppEnv, SessionUser } from '../lib/context';
import { AppError } from '../lib/errors';
import { isId } from '../lib/ids';
import type { ResolveSession } from '../lib/session';
import { SESSION_COOKIE, type Auth } from './auth';

/**
 * The web session (architecture §8): Better Auth's signed, HttpOnly cookie. `requireSession` is
 * where a route gets the user id it may give `withUser` (CONVENTIONS §3); an agent's token is the
 * only other source (P1-T13).
 */

/** What Better Auth's `getSession` answers, as far as a session is read here. */
type SessionAnswer = {
  user: { id: string; emailVerified: boolean };
  session: { createdAt: Date };
} | null;

function userOf(answer: SessionAnswer): SessionUser | null {
  if (!answer || !isId(answer.user.id, 'usr')) return null;
  return {
    userId: answer.user.id,
    emailVerified: answer.user.emailVerified,
    signedInAt: new Date(answer.session.createdAt),
  };
}

/**
 * Reads the session cookie through Better Auth: the person, or null. A request without the cookie
 * never touches Better Auth or the database. When the session's end moves (once a day of use), the
 * refreshed cookie goes out with the response, so the browser's copy slides too.
 *
 * A read once the response is final (`touchCheckedOnSession` reads after it) could send no cookie,
 * so it neither refreshes the session, whose new end the browser would never learn, nor writes to
 * the response. The session the request carried may be gone by then, signed out by the request
 * itself: that is null, like any other. The next read during a request refreshes it as usual.
 */
export function sessionFromCookie(auth: () => Auth): ResolveSession {
  return async (c) => {
    if (!(c.req.header('Cookie') ?? '').includes(SESSION_COOKIE)) return null;
    if (c.finalized) {
      return userOf(
        await auth().api.getSession({
          headers: c.req.raw.headers,
          query: { disableRefresh: true },
        }),
      );
    }
    const { headers, response } = await auth().api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
    return userOf(response);
  };
}

export interface VerifiedSession {
  userId: string;
  emailVerified: boolean;
  /** When this session was signed in, when the resolver knows. */
  signedInAt?: Date;
}

/** The signed-in person, or `UNAUTHENTICATED`, which sends the web app to sign in. */
export async function requireSession(c: Context<AppEnv>): Promise<VerifiedSession> {
  const user = await c.var.session();
  if (user === null) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first: this needs a signed-in session.');
  }
  return {
    userId: user.userId,
    emailVerified: user.emailVerified,
    ...(user.signedInAt === undefined ? {} : { signedInAt: user.signedInAt }),
  };
}

/** How fresh the sign-in must be to delete the account (architecture §7.2, PRD J10). */
export const RECENT_SIGN_IN_MS = 10 * 60_000;

/**
 * The signed-in person with a sign-in in the last 10 minutes, or `REAUTH_REQUIRED`, which sends
 * the web app to sign in again. An unknown sign-in time refuses too: only a known-fresh session
 * may delete the account. `now` is the clock the tests move.
 */
export async function requireRecentSignIn(
  c: Context<AppEnv>,
  now: () => Date = () => new Date(),
): Promise<VerifiedSession> {
  const session = await requireSession(c);
  if (
    session.signedInAt === undefined ||
    now().getTime() - session.signedInAt.getTime() > RECENT_SIGN_IN_MS
  ) {
    throw new AppError(
      'REAUTH_REQUIRED',
      'Sign in again first: deleting the account needs a sign-in from the last 10 minutes.',
    );
  }
  return session;
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
