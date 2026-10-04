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
});
