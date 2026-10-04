import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv, SessionUser } from './context';
import { noSession, sessionContext, type ResolveSession } from './session';

const USER: SessionUser = {
  userId: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
  emailVerified: true,
  segment: 'accumulating',
};

function appWith(resolve: ResolveSession) {
  const app = new Hono<AppEnv>();
  app.use('*', sessionContext(resolve));
  app.get('/twice', async (c) => {
    const first = await c.var.session();
    const second = await c.var.session();
    return c.json({ first, second });
  });
  app.get('/none', (c) => c.text('no session needed'));
  return app;
}

describe('sessionContext()', () => {
  it('resolves the session once per request, on the first ask', async () => {
    let reads = 0;
    const app = appWith(() => {
      reads += 1;
      return Promise.resolve(USER);
    });
    expect(await (await app.request('/twice')).json()).toStrictEqual({ first: USER, second: USER });
    expect(reads).toBe(1);
    await app.request('/none');
    expect(reads).toBe(1);
  });

  it('has nobody signed in until sessions exist', async () => {
    expect(await (await appWith(noSession).request('/twice')).json()).toStrictEqual({
      first: null,
      second: null,
    });
  });
});
