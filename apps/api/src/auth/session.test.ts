import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv, SessionUser } from '../lib/context';
import { handleError } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import { sessionContext } from '../lib/session';
import type { Auth } from './auth';
import { requireSession, requireVerifiedEmail, sessionFromCookie } from './session';

const USER = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';

function appAs(user: SessionUser | null) {
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    sessionContext(() => Promise.resolve(user)),
  );
  app.get('/any', async (c) => c.json(await requireSession(c)));
  app.get('/agent', async (c) => c.json(await requireVerifiedEmail(c)));
  app.onError(handleError);
  return app;
}

describe('requireSession()', () => {
  it('gives the session’s user id and whether the email is verified', async () => {
    const res = await appAs({ userId: USER, emailVerified: false }).request('/any');
    expect(await res.json()).toStrictEqual({ userId: USER, emailVerified: false });
  });

  it('answers UNAUTHENTICATED without a session', async () => {
    const res = await appAs(null).request('/any');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('requireVerifiedEmail()', () => {
  it('lets a verified person start an agent connection', async () => {
    const res = await appAs({ userId: USER, emailVerified: true }).request('/agent');
    expect(await res.json()).toStrictEqual({ userId: USER, emailVerified: true });
  });

  it('answers EMAIL_NOT_VERIFIED for an unverified one, and UNAUTHENTICATED for nobody', async () => {
    const unverified = await appAs({ userId: USER, emailVerified: false }).request('/agent');
    expect(unverified.status).toBe(403);
    expect(await unverified.json()).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
    expect((await appAs(null).request('/agent')).status).toBe(401);
  });
});

describe('sessionFromCookie()', () => {
  it('never asks Better Auth when the request has no session cookie', async () => {
    let asked = 0;
    const auth = (() => {
      asked += 1;
      throw new Error('Better Auth was asked');
    }) as unknown as () => Auth;
    const app = new Hono<AppEnv>();
    app.use('*', sessionContext(sessionFromCookie(auth)));
    app.get('/', async (c) => c.json({ user: await c.var.session() }));
    const res = await app.request('/', { headers: { Cookie: 'theme=dark' } });
    expect(await res.json()).toStrictEqual({ user: null });
    expect(asked).toBe(0);
  });

  /** The cookie a session due its daily refresh is answered with. */
  const REFRESHED = '__Secure-netnet.session_token=abc.sig; Max-Age=2592000; Path=/; HttpOnly';

  /**
   * Better Auth's `getSession`, faked: it records what it was asked, and answers a session that is
   * due its refresh, with the refreshed cookie unless asked not to refresh.
   */
  function fakeAuth() {
    const asked: Record<string, unknown>[] = [];
    const answer = {
      user: { id: USER, emailVerified: true },
      session: { createdAt: new Date('2026-08-01T10:00:00Z') },
    };
    const getSession = (options: Record<string, unknown>) => {
      asked.push(options);
      const refresh = !(options.query as { disableRefresh?: boolean } | undefined)?.disableRefresh;
      const headers = new Headers();
      if (refresh) headers.append('Set-Cookie', REFRESHED);
      return Promise.resolve(options.returnHeaders ? { headers, response: answer } : answer);
    };
    const auth = (() => ({ api: { getSession } })) as unknown as () => Auth;
    return { auth, asked };
  }

  const SIGNED_IN = { Cookie: '__Secure-netnet.session_token=abc.sig' };
  const READ_USER = { userId: USER, emailVerified: true, signedInAt: '2026-08-01T10:00:00.000Z' };

  it('refreshes a session read during the request, and sends its cookie with the response', async () => {
    const { auth, asked } = fakeAuth();
    const app = new Hono<AppEnv>();
    app.use('*', sessionContext(sessionFromCookie(auth)));
    app.get('/', async (c) => c.json({ user: await c.var.session() }));
    const res = await app.request('/', { headers: SIGNED_IN });
    expect(await res.json()).toStrictEqual({ user: READ_USER });
    expect(res.headers.getSetCookie()).toStrictEqual([REFRESHED]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ returnHeaders: true });
    expect(asked[0]).not.toHaveProperty('query');
  });

  it('refreshes nothing and writes nothing when read after the response', async () => {
    const { auth, asked } = fakeAuth();
    const app = new Hono<AppEnv>();
    let read: { before: Response; after: Response; user: unknown } | undefined;
    app.use('*', sessionContext(sessionFromCookie(auth)));
    // As touchCheckedOnSession does: the route answers, then the session is read.
    app.use('*', async (c, next) => {
      await next();
      const before = c.res;
      const user = await c.var.session();
      read = { before, after: c.res, user };
    });
    app.get('/', (c) => c.text('no session needed'));
    const res = await app.request('/', { headers: SIGNED_IN });
    expect(await res.text()).toBe('no session needed');
    expect(asked).toStrictEqual([
      { headers: expect.any(Headers) as unknown, query: { disableRefresh: true } },
    ]);
    expect(JSON.parse(JSON.stringify(read?.user))).toStrictEqual(READ_USER);
    // The finalized response is the one the route answered, untouched.
    expect(read?.after).toBe(read?.before);
    expect(res.headers.getSetCookie()).toStrictEqual([]);
  });
});
