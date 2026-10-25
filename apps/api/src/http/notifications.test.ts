import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
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

/** The fake push service these tests pass as the list. */
const FAKE_PUSH_HOSTS = ['push.example.net'];

const NOT_A_PUSH_SERVICE =
  "This browser's push service is not one NetNet sends to; reminders will come by email instead.";

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
    pushHosts: FAKE_PUSH_HOSTS,
  };
  return appOver(user, notificationsRoutes(deps));
}

function appOver(user: SessionUser | null, routes: Hono<AppEnv>) {
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    sessionContext(() => Promise.resolve(user)),
  );
  app.route('/api/notifications', routes);
  app.onError(handleError);
  return app;
}

async function code(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; code: string; text: string; fields?: Record<string, string> }> {
  const res = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const parsed = JSON.parse(text) as { error: { code: string; fields?: Record<string, string> } };
  return {
    status: res.status,
    code: parsed.error.code,
    text,
    ...(parsed.error.fields === undefined ? {} : { fields: parsed.error.fields }),
  };
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
    // The log's lines only: with no Sentry DSN, an INTERNAL error's stack goes to stderr too.
    const capture = (line: unknown) => void (typeof line === 'string' && logged.push(line));
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

  it('passes a subscription at a host on the list it is given on to the database', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = appAs(USER, VAPID);
    // The stub database throws when reached: INTERNAL here means validation let it through.
    expect(await code(app, 'POST', '/api/notifications/endpoints', SUBSCRIPTION)).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
    expect(
      await code(app, 'PUT', '/api/notifications/endpoints/nep_x', {
        endpoint: SUBSCRIPTION.endpoint,
        keys: SUBSCRIPTION.keys,
      }),
    ).toMatchObject({ status: 500, code: 'INTERNAL' });
    logs.mockRestore();
  });

  it('POST and PUT refuse an endpoint off the list in plain words, before any write', async () => {
    const app = appAs(USER, VAPID);
    for (const endpoint of [
      'https://push.example.org/push/abc',
      'https://evilpush.example.net/push/abc',
      'https://push.example.net.evil.example/push/abc',
      'https://192.0.2.10/push/abc',
      'https://[2001:db8::1]/push/abc',
      'https://push.example.net:8443/push/abc',
      'https://someone@push.example.net/push/abc',
    ]) {
      const post = await code(app, 'POST', '/api/notifications/endpoints', {
        ...SUBSCRIPTION,
        endpoint,
      });
      expect(post, endpoint).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        fields: { endpoint: NOT_A_PUSH_SERVICE },
      });
      const put = await code(app, 'PUT', '/api/notifications/endpoints/nep_x', {
        endpoint,
        keys: SUBSCRIPTION.keys,
      });
      expect(put, endpoint).toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        fields: { endpoint: NOT_A_PUSH_SERVICE },
      });
    }
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

describe('production’s routes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('take only the push services’ hosts, so a test’s fake service is refused', async () => {
    const keys = webpush.generateVAPIDKeys();
    vi.stubEnv('VAPID_PUBLIC_KEY', keys.publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', keys.privateKey);
    vi.stubEnv('VAPID_SUBJECT', 'mailto:push@netnet.example');
    // The default wiring, as app.ts mounts it: the database is never reached for a refusal.
    const app = appOver(USER, notificationsRoutes());
    expect(await code(app, 'POST', '/api/notifications/endpoints', SUBSCRIPTION)).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fields: { endpoint: NOT_A_PUSH_SERVICE },
    });
    expect(
      await code(app, 'PUT', '/api/notifications/endpoints/nep_x', {
        endpoint: SUBSCRIPTION.endpoint,
        keys: SUBSCRIPTION.keys,
      }),
    ).toMatchObject({ status: 400, fields: { endpoint: NOT_A_PUSH_SERVICE } });
  });
});
