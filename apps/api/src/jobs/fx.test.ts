import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from '../content/fx-sync';
import type { AppEnv } from '../lib/context';
import { handleError, handleNotFound } from '../lib/error-handler';
import { noStore, requestContext } from '../lib/request-context';
import { cronAuth } from './cron';
import { fxJob } from './fx';

const SECRET = 'test-cron-secret-0123456789abcdef';
const OK: SyncResult = {
  ecb: { ok: true, from: '2026-07-28', to: '2026-08-04', fetched: 30, inserted: 29 },
  fallback: { ok: true, from: '2026-07-28', to: '2026-08-04', fetched: 117, inserted: 117 },
};

function appWith(
  sync: (today: string) => Promise<SyncResult>,
  secret: string | undefined = SECRET,
) {
  const app = new Hono<AppEnv>();
  app.use('*', requestContext(), noStore());
  app.use(
    '/api/cron/*',
    cronAuth(() => secret),
  );
  app.get('/api/cron/fx', fxJob({ sync, clock: () => new Date('2026-08-04T17:03:00Z') }));
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}

let logged: Record<string, unknown>[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(JSON.parse(line) as Record<string, unknown>);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
});
afterEach(() => vi.restoreAllMocks());

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

describe('GET /api/cron/fx: the bearer secret', () => {
  it.each([
    ['no Authorization header', {}],
    ['a wrong secret', bearer('not-the-secret')],
    ['the secret with another scheme', { headers: { Authorization: `Basic ${SECRET}` } }],
    ['the secret alone', { headers: { Authorization: SECRET } }],
  ])('rejects %s with 401, and runs nothing', async (_, init) => {
    const sync = vi.fn(() => Promise.resolve(OK));
    const res = await appWith(sync).request('/api/cron/fx', init);
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(sync).not.toHaveBeenCalled();
  });

  it('rejects everyone when CRON_SECRET is not set', async () => {
    for (const secret of [undefined, '']) {
      const sync = vi.fn(() => Promise.resolve(OK));
      const res = await appWith(sync, secret).request('/api/cron/fx', bearer(''));
      expect(res.status).toBe(401);
      expect(sync).not.toHaveBeenCalled();
    }
  });
});

describe('GET /api/cron/fx: the run', () => {
  it('syncs through today, in UTC, and reports each source', async () => {
    const sync = vi.fn(() => Promise.resolve(OK));
    const res = await appWith(sync).request('/api/cron/fx', bearer(SECRET));
    expect(res.status).toBe(200);
    expect(sync).toHaveBeenCalledWith('2026-08-04');
    expect(await res.json()).toStrictEqual(OK);
    expect(logged.filter((l) => String(l.event).startsWith('fx_'))).toStrictEqual([]);
  });

  it('logs a failed source and answers 502, so the cron run shows as failed', async () => {
    const failed: SyncResult = {
      ...OK,
      fallback: {
        ok: false,
        from: '2026-07-28',
        to: '2026-08-04',
        failedFrom: '2026-07-28',
        status: 503,
        message: 'The source answered 503.',
      },
    };
    const res = await appWith(() => Promise.resolve(failed)).request(
      '/api/cron/fx',
      bearer(SECRET),
    );
    expect(res.status).toBe(502);
    const line = logged.find((l) => l.event === 'fx_fallback_fetch_failed');
    expect(line).toMatchObject({ route: 'GET /api/cron/fx', status: 503 });
    expect(Object.keys(line ?? {}).sort()).toStrictEqual(['event', 'requestId', 'route', 'status']);
    expect(logged.some((l) => l.event === 'fx_ecb_fetch_failed')).toBe(false);
  });

  it('logs 502 for a source that never answered', async () => {
    const failed: SyncResult = {
      ...OK,
      ecb: {
        ok: false,
        from: '2026-07-28',
        to: '2026-08-04',
        failedFrom: '2026-07-28',
        message: 'The request failed: fetch failed',
      },
    };
    await appWith(() => Promise.resolve(failed)).request('/api/cron/fx', bearer(SECRET));
    expect(logged.find((l) => l.event === 'fx_ecb_fetch_failed')).toMatchObject({ status: 502 });
  });
});
