import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAKS,
  captureLog,
  drizzleFailure,
  plainFailure,
  type CapturedLog,
} from '../../test/support/failures';
import { captureWaitUntil, type CapturedWaitUntil } from '../../test/support/wait-until';
import { afterResponse, inBackground } from './after-response';
import type { AppEnv } from './context';
import { requestContext } from './request-context';

let log: CapturedLog;

beforeEach(() => {
  log = captureLog();
});

afterEach(() => vi.restoreAllMocks());

function appRunning(task: () => Promise<unknown>) {
  const app = new Hono<AppEnv>();
  app.use('*', requestContext());
  app.post('/work', (c) => {
    afterResponse(c, task());
    return c.body(null, 204);
  });
  return app;
}

describe('afterResponse()', () => {
  let vercel: CapturedWaitUntil;

  beforeEach(() => {
    vercel = captureWaitUntil();
  });

  afterEach(() => vercel.restore());

  it('answers first and hands the task to waitUntil on Vercel', async () => {
    let finish: () => void = () => undefined;
    let done = false;
    const res = await appRunning(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            done = true;
            resolve();
          };
        }),
    ).request('/work', { method: 'POST' });
    expect(res.status).toBe(204);
    expect(done).toBe(false);
    expect(vercel.pending).toBe(1);
    finish();
    await vercel.settle();
    expect(done).toBe(true);
  });

  it('logs a failed task with the request id and the error’s class, and never rejects', async () => {
    const res = await appRunning(() => Promise.reject(plainFailure())).request('/work', {
      method: 'POST',
    });
    await vercel.settle();
    expect(res.status).toBe(204);
    expect(log.of('after_response_failed')).toStrictEqual([
      {
        event: 'after_response_failed',
        requestId: res.headers.get('X-Request-Id'),
        route: 'POST /work',
        errorCode: 'INTERNAL',
        errorName: 'TypeError',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });

  it('names a Postgres failure’s SQLSTATE, and never its message, SQL or values', async () => {
    const res = await appRunning(() => Promise.reject(drizzleFailure())).request('/work', {
      method: 'POST',
    });
    await vercel.settle();
    expect(log.of('after_response_failed')).toStrictEqual([
      {
        event: 'after_response_failed',
        requestId: res.headers.get('X-Request-Id'),
        route: 'POST /work',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });
});

describe('inBackground()', () => {
  it('hands the rejection to the failure callback, once', async () => {
    const vercel = captureWaitUntil();
    try {
      const error = new Error('boom');
      const seen: unknown[] = [];
      inBackground(Promise.reject(error), (failure) => void seen.push(failure));
      inBackground(Promise.resolve('fine'), (failure) => void seen.push(failure));
      await vercel.settle();
      expect(seen).toStrictEqual([error]);
    } finally {
      vercel.restore();
    }
  });
});

describe('afterResponse() off Vercel', () => {
  it('lets the task run on by itself', async () => {
    let done = false;
    const res = await appRunning(async () => {
      await Promise.resolve();
      done = true;
    }).request('/work', { method: 'POST' });
    expect(res.status).toBe(204);
    await vi.waitFor(() => expect(done).toBe(true));
  });
});
