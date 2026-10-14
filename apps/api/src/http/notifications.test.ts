import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv, SessionUser } from '../lib/context';
import { handleError } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import { sessionContext } from '../lib/session';
import type { VapidConfig } from '../notify/webpush';
import { notificationsRoutes, type NotificationsDeps } from './notifications';

/**
 * `/api/notifications/*` without a database: everything a request is refused for is decided before
 * the endpoints are read. The rest is in test/notifications/, against Postgres.
 */
const USER: SessionUser = { userId: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA', emailVerified: true };
const VAPID: VapidConfig = {
  publicKey: 'BEl64zVAPIDpublicKeyForTestsOnly0123456789_-test',
  privateKey: 'testVAPIDprivateKeyForTestsOnly0123456789_-',
  subject: 'mailto:push@netnet.example',
};

const SUBSCRIPTION = {
  endpoint: 'https://push.example.net/push/abc123',
  keys: { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' },
  platform: 'android',
  deviceLabel: 'Android · Chrome',
};

function appAs(user: SessionUser | null, vapid: VapidConfig | undefined) {
  const deps: NotificationsDeps = {
    db: () => {
      throw new Error('the database was reached');
    },
    track: () => {
      throw new Error('an event was tracked');
    },
    appVersion: () => 'test123',
    clock: () => new Date('2026-08-01T10:00:00.000Z'),
    vapid: () => vapid,
  };
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    sessionContext(() => Promise.resolve(user)),
  );
  app.route('/api/notifications', notificationsRoutes(deps));
  app.onError(handleError);
  return app;
}

async function code(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; code: string; text: string }> {
  const res = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const parsed = JSON.parse(text) as { error: { code: string } };
  return { status: res.status, code: parsed.error.code, text };
}

describe('without a session', () => {
  it('every route answers UNAUTHENTICATED', async () => {
    const app = appAs(null, VAPID);
    expect(await code(app, 'GET', '/api/notifications/prefs')).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(await code(app, 'PATCH', '/api/notifications/prefs', {})).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(await code(app, 'GET', '/api/notifications/vapid-key')).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(await code(app, 'POST', '/api/notifications/endpoints', SUBSCRIPTION)).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(
      await code(app, 'PUT', '/api/notifications/endpoints/nep_x', SUBSCRIPTION),
    ).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(await code(app, 'DELETE', '/api/notifications/endpoints/nep_x?by=user')).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('without the VAPID keys (F19)', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    const capture = (line: string) => void logged.push(line);
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
  });

  afterEach(() => vi.restoreAllMocks());

  it('the key and the subscribe fail closed, and the log names the cause', async () => {
    const app = appAs(USER, undefined);
    expect(await code(app, 'GET', '/api/notifications/vapid-key')).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
    expect(await code(app, 'POST', '/api/notifications/endpoints', SUBSCRIPTION)).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
    expect(logged.filter((line) => line.includes('vapid_not_configured'))).toHaveLength(2);
  });
});

describe('validation', () => {
  it('PATCH /prefs refuses an empty patch and an unknown switch', async () => {
    const app = appAs(USER, VAPID);
    expect(await code(app, 'PATCH', '/api/notifications/prefs', {})).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(await code(app, 'PATCH', '/api/notifications/prefs', { sms: true })).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(
      await code(app, 'PATCH', '/api/notifications/prefs', { reminders: 'off' }),
    ).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('POST /endpoints refuses a bad subscription field by field', async () => {
    const app = appAs(USER, VAPID);
    for (const body of [
      { ...SUBSCRIPTION, endpoint: 'http://push.example.net/push/abc' },
      { ...SUBSCRIPTION, keys: { p256dh: '', auth: 'abc' } },
      { ...SUBSCRIPTION, platform: 'windows-phone' },
      { ...SUBSCRIPTION, deviceLabel: '' },
      { ...SUBSCRIPTION, extra: true },
    ]) {
      const answer = await code(app, 'POST', '/api/notifications/endpoints', body);
      expect(answer, JSON.stringify(body)).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
      });
    }
  });

  it('PUT /endpoints/:id refuses a bad subscription', async () => {
    const app = appAs(USER, VAPID);
    expect(
      await code(app, 'PUT', '/api/notifications/endpoints/nep_x', {
        endpoint: 'not a url',
        keys: SUBSCRIPTION.keys,
      }),
    ).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('DELETE /endpoints/:id requires ?by=user|signout', async () => {
    const app = appAs(USER, VAPID);
    for (const path of [
      '/api/notifications/endpoints/nep_x',
      '/api/notifications/endpoints/nep_x?by=browser',
      '/api/notifications/endpoints/nep_x?by=',
    ]) {
      const answer = await code(app, 'DELETE', path);
      expect(answer, path).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(answer.text).toContain('by');
    }
  });
});
