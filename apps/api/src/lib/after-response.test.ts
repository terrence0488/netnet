import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWaitUntil, type CapturedWaitUntil } from '../../test/support/wait-until';
import { afterResponse } from './after-response';
import type { AppEnv } from './context';
import { requestContext } from './request-context';

let logged: string[];

beforeEach(() => {
  logged = [];
  const capture = (line: string) => void logged.push(line);
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
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

  it('logs a failed task with the request id and never rejects', async () => {
    const res = await appRunning(() =>
      Promise.reject(new Error('relation does not exist')),
    ).request('/work', { method: 'POST' });
    await vercel.settle();
    expect(res.status).toBe(204);
    const failure = logged
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === 'after_response_failed');
    expect(failure).toStrictEqual({
      event: 'after_response_failed',
      requestId: res.headers.get('X-Request-Id'),
      route: 'POST /work',
      errorCode: 'INTERNAL',
    });
    expect(logged.join('\n')).not.toContain('relation');
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
