import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { clientIp, createRateLimit, type RateLimit } from './rate-limit';

/** 2026-08-01T10:00:00Z: a minute boundary. */
const START = Date.UTC(2026, 7, 1, 10);

let now: number;
let counters: Map<string, number>;
let limit: RateLimit;

beforeEach(() => {
  now = START;
  counters = new Map();
  limit = createRateLimit(() => ({
    count: (key, windowStart) => {
      const slot = `${key}@${windowStart.toISOString()}`;
      const count = (counters.get(slot) ?? 0) + 1;
      counters.set(slot, count);
      return Promise.resolve(count);
    },
    clock: () => new Date(now),
  }));
});

async function refusal(promise: Promise<void>): Promise<AppError> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof AppError)) throw new Error('expected a refusal');
  return error;
}

describe('rateLimit()', () => {
  it('allows the limit in a window, then refuses with RATE_LIMITED and the seconds left', async () => {
    for (let i = 0; i < 3; i += 1) await limit('signup:ip:192.0.2.1', 3, 60);
    now = START + 15_500;
    const error = await refusal(limit('signup:ip:192.0.2.1', 3, 60));
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.details).toStrictEqual({ retry_after_s: 45 });
  });

  it('starts again with the next window', async () => {
    for (let i = 0; i < 2; i += 1) await limit('k', 2, 60);
    now = START + 59_999;
    await expect(limit('k', 2, 60)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retry_after_s: 1 },
    });
    now = START + 60_000;
    await expect(limit('k', 2, 60)).resolves.toBe(undefined);
  });

  it('counts each key on its own', async () => {
    await limit('events:ip:192.0.2.1', 1, 60);
    await expect(limit('events:ip:192.0.2.2', 1, 60)).resolves.toBe(undefined);
    await expect(limit('events:ip:192.0.2.1', 1, 60)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('stores a key as its SHA-256, never the address or email in it', async () => {
    await limit('signin:192.0.2.1:someone@example.com', 10, 60);
    const [slot] = [...counters.keys()];
    expect(slot).toMatch(/^[0-9a-f]{64}@2026-08-01T10:00:00.000Z$/);
  });

  it('refuses a limit or a window that is not a whole number from 1', async () => {
    await expect(limit('k', 0, 60)).rejects.toThrow(RangeError);
    await expect(limit('k', 1.5, 60)).rejects.toThrow(RangeError);
    await expect(limit('k', 5, 0)).rejects.toThrow(RangeError);
  });
});

describe('clientIp()', () => {
  async function ipFor(headers: Record<string, string>): Promise<string> {
    const app = new Hono().get('/', (c) => c.text(clientIp(c)));
    return (await app.request('/', { headers })).text();
  }

  it('reads the address the platform sets', async () => {
    expect(await ipFor({ 'x-real-ip': '192.0.2.7' })).toBe('192.0.2.7');
    expect(await ipFor({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' })).toBe('198.51.100.4');
    expect(await ipFor({ 'x-forwarded-for': '2001:db8::1' })).toBe('2001:db8::1');
  });

  it('falls back to one shared key without one', async () => {
    expect(await ipFor({})).toBe('unknown');
  });
});
