import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../lib/context';
import { handleError, handleNotFound } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import type { Agent } from './agent';
import type { Auth } from './auth';
import { authRoutes } from './routes';

/** A stand-in for Better Auth that records what reached it, and what the limits counted. */
function harness() {
  const reached: { path: string; body: string }[] = [];
  const counted: string[] = [];
  const auth = {
    handler: async (request: Request) => {
      reached.push({ path: new URL(request.url).pathname, body: await request.text() });
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    },
  } as unknown as Auth;
  const app = new Hono<AppEnv>();
  app.use('*', requestContext());
  app.route(
    '/api/auth',
    authRoutes({
      auth: () => auth,
      rateLimit: (key) => {
        counted.push(key);
        return Promise.resolve();
      },
      origin: () => 'http://localhost:5173',
      agent: () => ({}) as Agent,
      db: () => {
        throw new Error('no database in this test');
      },
    }),
  );
  app.notFound(handleNotFound);
  app.onError(handleError);
  return { app, reached, counted };
}

function post(app: Hono<AppEnv>, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.1' },
    body: JSON.stringify(body),
  });
}

describe('authRoutes()', () => {
  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/sign-in/email'],
    ['POST', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/google'],
    ['POST', '/api/auth/callback/apple'],
    ['POST', '/api/auth/sign-out'],
    ['GET', '/api/auth/verify-email'],
    ['POST', '/api/auth/send-verification-email'],
    ['POST', '/api/auth/request-password-reset'],
    ['GET', '/api/auth/reset-password/some-token'],
    ['POST', '/api/auth/reset-password'],
    ['GET', '/api/auth/get-session'],
  ])('serves %s %s through Better Auth', async (method, path) => {
    const { app, reached } = harness();
    const res = await app.request(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
    expect(res.status).toBe(200);
    expect(reached.map((r) => r.path)).toEqual([path]);
  });

  it.each([
    ['POST', '/api/auth/update-user'],
    ['POST', '/api/auth/change-email'],
    ['POST', '/api/auth/delete-user'],
    ['GET', '/api/auth/list-accounts'],
    ['POST', '/api/auth/link-social'],
    ['GET', '/api/auth/ok'],
    ['POST', '/api/auth/oauth2/consent'],
    ['POST', '/api/auth/oauth2/continue'],
    ['POST', '/api/auth/oauth2/introspect'],
    ['GET', '/api/auth/oauth2/userinfo'],
    ['POST', '/api/auth/oauth2/create-client'],
    ['GET', '/api/auth/oauth2/get-consents'],
    ['POST', '/api/auth/token'],
    ['GET', '/api/auth/token'],
  ])('answers NOT_FOUND for Better Auth’s other endpoints: %s %s', async (method, path) => {
    const { app, reached } = harness();
    const res = await app.request(path, { method });
    expect(res.status).toBe(404);
    expect(reached).toEqual([]);
  });

  it('fills in the empty name sign-up needs, and keeps everything else', async () => {
    const { app, reached } = harness();
    await post(app, '/api/auth/sign-up/email', {
      email: 'person@example.com',
      password: 'aaaaaaaa',
      timeZone: 'Asia/Singapore',
    });
    expect(JSON.parse(reached[0]?.body ?? '')).toStrictEqual({
      email: 'person@example.com',
      password: 'aaaaaaaa',
      timeZone: 'Asia/Singapore',
      name: '',
    });
  });

  it('reads a streamed body (no Content-Length) for its limit, and still passes it on', async () => {
    const { app, reached, counted } = harness();
    const body = JSON.stringify({ email: 'Person@Example.com', password: 'aaaaaaaa' });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    const res = await app.request(
      new Request('http://localhost/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.1' },
        body: stream,
        duplex: 'half',
      }),
    );
    expect(res.status).toBe(200);
    expect(counted).toEqual(['signin:192.0.2.1:person@example.com']);
    expect(reached.map((r) => r.body)).toEqual([body]);
  });

  it('refuses a body over 4 KB before counting it or passing it on', async () => {
    const { app, reached, counted } = harness();
    const res = await post(app, '/api/auth/sign-in/email', {
      email: 'person@example.com',
      password: 'x'.repeat(5000),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(reached).toEqual([]);
    expect(counted).toEqual([]);
  });

  it('counts sign-ups per IP, sign-ins per IP and email, and email requests per IP', async () => {
    const { app, counted } = harness();
    await post(app, '/api/auth/sign-up/email', { email: 'a@example.com', password: 'x' });
    await post(app, '/api/auth/sign-in/email', { email: ' Person@Example.com ', password: 'x' });
    await post(app, '/api/auth/sign-in/social', { provider: 'google' });
    await post(app, '/api/auth/request-password-reset', { email: 'a@example.com' });
    await post(app, '/api/auth/send-verification-email', { email: 'a@example.com' });
    await app.request('/api/auth/sign-out', { method: 'POST' });
    await app.request('/api/auth/callback/google?code=x&state=y', { method: 'GET' });
    expect(counted).toEqual([
      'signup:ip:192.0.2.1',
      'signin:192.0.2.1:person@example.com',
      'social:ip:192.0.2.1',
      'reset:ip:192.0.2.1',
      'verify:ip:192.0.2.1',
    ]);
  });
});
