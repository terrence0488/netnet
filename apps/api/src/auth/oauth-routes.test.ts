import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv, SessionUser } from '../lib/context';
import { handleError, handleNotFound } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import { sessionContext } from '../lib/session';
import type { Agent } from './agent';
import type { Auth } from './auth';
import { APPROVAL_PAGE } from './oauth';
import { REGISTRATIONS_PER_HOUR, oauthRoutes, wellKnownRoutes } from './oauth-routes';
import { originCheck } from './origin-check';

/**
 * The OAuth routes around a stand-in for Better Auth: which endpoints reach it, and what NetNet
 * adds on the way (the 302, `resource` required, no cookie for the agent's endpoints, the DCR
 * limit, the attempt hearing of the authorize request).
 */
const ORIGIN = 'http://localhost:5173';
const PERSON = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';

interface Reached {
  method: string;
  path: string;
  cookie: string | null;
  body: string;
}

function harness(answer: (request: Request) => Response, session: SessionUser | null = null) {
  const reached: Reached[] = [];
  const counted: string[] = [];
  const heard: string[] = [];
  const auth = {
    handler: async (request: Request) => {
      reached.push({
        method: request.method,
        path: new URL(request.url).pathname,
        cookie: request.headers.get('Cookie'),
        body: await request.clone().text(),
      });
      return answer(request);
    },
  } as unknown as Auth;
  const agent = {
    attempts: {
      authorizeSeen: (userId: string) => {
        heard.push(`seen:${userId}`);
        return Promise.resolve();
      },
      authorizeRefused: (userId: string) => {
        heard.push(`refused:${userId}`);
        return Promise.resolve();
      },
    },
  } as unknown as Agent;
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    originCheck(() => [ORIGIN]),
    sessionContext(() => Promise.resolve(session)),
  );
  app.route(
    '/api/auth',
    oauthRoutes({
      auth: () => auth,
      rateLimit: (key) => {
        counted.push(key);
        return Promise.resolve();
      },
      origin: () => ORIGIN,
      agent: () => agent,
      db: () => {
        throw new Error('no database in this test');
      },
    }),
  );
  app.route(
    '/.well-known',
    wellKnownRoutes(() => auth),
  );
  app.notFound(handleNotFound);
  app.onError(handleError);
  return { app, reached, counted, heard };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

const AUTHORIZE = `${ORIGIN}/api/auth/oauth2/authorize?client_id=abc&resource=${encodeURIComponent(`${ORIGIN}/mcp`)}`;

describe('the authorize endpoint', () => {
  it('turns the library’s JSON {redirect, url} into a 302, keeping its cookies', async () => {
    const { app } = harness(() => {
      const res = json({ redirect: true, url: `${APPROVAL_PAGE}?client_id=abc&sig=x` });
      res.headers.append('Set-Cookie', 'a=1; Path=/');
      res.headers.append('Set-Cookie', 'b=2; Path=/');
      return res;
    });
    const res = await app.request(AUTHORIZE);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${APPROVAL_PAGE}?client_id=abc&sig=x`);
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(await res.text()).toBe('');
  });

  it('passes the library’s own redirects through as they are', async () => {
    const redirect = harness(
      () => new Response(null, { status: 302, headers: { Location: 'https://agent.example/cb' } }),
    );
    const res = await redirect.app.request(AUTHORIZE);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://agent.example/cb');
  });

  it('sends a JSON error to the approval page, so a browser never shows JSON', async () => {
    const { app } = harness(() =>
      json(
        { error: 'invalid_client', error_description: 'Metadata document exceeds 5KB size limit' },
        { status: 400 },
      ),
    );
    const res = await app.request(AUTHORIZE);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(location.pathname).toBe(APPROVAL_PAGE);
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(location.searchParams.get('error_description')).toBe(
      'Metadata document exceeds 5KB size limit',
    );
  });

  it('requires resource, sending the browser to the approval page with the error', async () => {
    const { app, reached } = harness(() => json({}));
    const res = await app.request(`${ORIGIN}/api/auth/oauth2/authorize?client_id=abc`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(`${ORIGIN}${APPROVAL_PAGE}`);
    expect(location.searchParams.get('error')).toBe('invalid_target');
    expect(reached).toEqual([]);
  });

  it('sends Better Auth’s error page to the approval page, which explains', async () => {
    const { app } = harness(() =>
      json({
        redirect: true,
        url: `${ORIGIN}/api/auth/error?error=invalid_client&error_description=client_id+is+required`,
      }),
    );
    const res = await app.request(AUTHORIZE);
    const location = new URL(res.headers.get('Location') ?? '');
    expect(location.pathname).toBe(APPROVAL_PAGE);
    expect(location.searchParams.get('error')).toBe('invalid_client');
    expect(location.searchParams.get('error_description')).toBe('client_id is required');
  });

  it('tells a signed-in person’s attempt the request arrived, or was refused', async () => {
    const person = { userId: PERSON, emailVerified: true };
    const seen = harness(() => json({ redirect: true, url: `${APPROVAL_PAGE}?sig=x` }), person);
    await seen.app.request(AUTHORIZE);
    const refused = harness(
      () => json({ redirect: true, url: 'https://agent.example/cb?error=invalid_scope' }),
      person,
    );
    await refused.app.request(AUTHORIZE);
    const silent = harness(
      () => json({ redirect: true, url: 'https://agent.example/cb?error=consent_required' }),
      person,
    );
    await silent.app.request(AUTHORIZE);
    expect([...seen.heard, ...refused.heard, ...silent.heard]).toEqual([
      `seen:${PERSON}`,
      `refused:${PERSON}`,
    ]);
  });

  it('tells nobody when nobody is signed in', async () => {
    const { app, heard } = harness(() => json({ redirect: true, url: `${APPROVAL_PAGE}?sig=x` }));
    await app.request(AUTHORIZE);
    expect(heard).toEqual([]);
  });
});

describe('the agent’s endpoints', () => {
  it.each([
    ['POST', '/api/auth/oauth2/token'],
    ['POST', '/api/auth/oauth2/register'],
    ['POST', '/api/auth/oauth2/revoke'],
    ['GET', '/api/auth/jwks'],
  ])('serve %s %s without the cookie, from any origin', async (method, path) => {
    const { app, reached } = harness(() => json({ ok: true }));
    const res = await app.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        Cookie: '__Secure-netnet.session_token=abc',
        Origin: 'https://agent.example',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      ...(method === 'POST' ? { body: 'grant_type=refresh_token' } : {}),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(reached).toEqual([
      expect.objectContaining({ method, path, cookie: null }) as unknown as Reached,
    ]);
  });

  it('counts DCR registrations per IP, an hour at a time', async () => {
    const { app, counted } = harness(() => json({}, { status: 201 }));
    await app.request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'x-real-ip': '198.51.100.7', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(counted).toEqual(['dcr:ip:198.51.100.7']);
    expect(REGISTRATIONS_PER_HOUR).toBe(10);
  });

  it('refuses a registration that asks for back-channel logout', async () => {
    const { app, reached } = harness(() => json({}, { status: 201 }));
    const res = await app.request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://agent.example/cb'],
        backchannel_logout_uri: 'https://agent.example/logout',
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_client_metadata' });
    expect(reached).toEqual([]);
  });

  it('refuses a body over 16 KB before Better Auth sees it', async () => {
    const { app, reached } = harness(() => json({}));
    const res = await app.request(`${ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'x'.repeat(17_000) }),
    });
    expect(res.status).toBe(400);
    expect(reached).toEqual([]);
  });
});

describe('/.well-known', () => {
  it.each([
    '/.well-known/oauth-authorization-server',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ])('serves %s from Better Auth, to any origin', async (path) => {
    const { app, reached } = harness(() => json({ issuer: ORIGIN }));
    const res = await app.request(`${ORIGIN}${path}`, { headers: { Origin: 'https://x.example' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(reached.map((r) => r.path)).toEqual([path]);
  });

  it('serves nothing else', async () => {
    const { app } = harness(() => json({}));
    expect((await app.request(`${ORIGIN}/.well-known/openid-configuration`)).status).toBe(404);
  });
});
