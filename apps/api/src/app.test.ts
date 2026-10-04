import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('GET /api/health', () => {
  it('answers ok, uncached, with a request id', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ ok: true });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Request-Id')).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it('gives each request its own id and ignores one sent by the caller', async () => {
    const first = await app.request('/api/health', { headers: { 'X-Request-Id': 'req_mine' } });
    const second = await app.request('/api/health');
    expect(first.headers.get('X-Request-Id')).not.toBe('req_mine');
    expect(first.headers.get('X-Request-Id')).not.toBe(second.headers.get('X-Request-Id'));
  });
});

describe('POST /api/events', () => {
  it('is mounted, and refuses a server-only event before touching the database', async () => {
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'value_recorded', props: { source: 'web' } }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('content and cron routes', () => {
  it('guards the FX cron with the bearer secret', async () => {
    const res = await app.request('/api/cron/fx');
    expect(res.status).toBe(401);
  });

  it('serves content under /api/content, checking the path before any database read', async () => {
    const res = await app.request('/api/content/nothing/generic@1');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('unknown routes', () => {
  it('answer NOT_FOUND in the error shape', async () => {
    const res = await app.request('/api/nothing-here', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toStrictEqual({
      error: { code: 'NOT_FOUND', message: 'Nothing is at POST /api/nothing-here.' },
    });
  });
});

describe('accounts', () => {
  it('mounts /api/me, which needs a session', async () => {
    const res = await app.request('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('mounts /api/geo, which suggests nothing without the CDN’s header', async () => {
    const res = await app.request('/api/geo');
    expect(await res.json()).toStrictEqual({ country: null });
  });

  it('serves only the listed Better Auth endpoints', async () => {
    const res = await app.request('/api/auth/update-user', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('the Origin check', () => {
  it('refuses a state-changing request from another site before any route runs', async () => {
    for (const path of ['/api/auth/sign-up/email', '/api/events', '/api/nothing-here']) {
      const res = await app.request(path, {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    }
  });
});
