import { ERROR_CODES, ERROR_STATUS, errorBodySchema, type ErrorCode } from '@netnet/contracts';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from './context';
import { handleError, handleNotFound } from './error-handler';
import { AppError } from './errors';
import { requestContext } from './request-context';

function appThrowing(error: unknown) {
  const app = new Hono<AppEnv>();
  app.use('*', requestContext());
  app.get('/boom', () => {
    throw error;
  });
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}

async function errorFrom(error: unknown) {
  const res = await appThrowing(error).request('/boom');
  const body: unknown = await res.json();
  return { res, body: errorBodySchema.parse(body), raw: body };
}

describe('handleError', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    const capture = (line: string) => void logged.push(line);
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const deliberate = ERROR_CODES.filter(
    (code): code is Exclude<ErrorCode, 'INTERNAL'> => code !== 'INTERNAL',
  );

  it.each(deliberate)('maps %s to its status with code and message', async (code) => {
    const { res, body } = await errorFrom(new AppError(code, `Fix the request (${code}).`));
    expect(res.status).toBe(ERROR_STATUS[code]);
    expect(body).toStrictEqual({ error: { code, message: `Fix the request (${code}).` } });
  });

  it('carries fields and code-specific details, never letting them replace code or message', async () => {
    const { res, raw } = await errorFrom(
      new AppError('VALIDATION_FAILED', 'Check the currency.', {
        fields: { currency: 'Use a three-letter ISO 4217 code, such as SGD.' },
        code: 'INTERNAL',
        message: 'overridden',
      }),
    );
    expect(res.status).toBe(400);
    expect(raw).toStrictEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Check the currency.',
        fields: { currency: 'Use a three-letter ISO 4217 code, such as SGD.' },
      },
    });
  });

  it('turns anything unexpected into INTERNAL with the request id, hiding its message', async () => {
    const { res, body } = await errorFrom(new Error('relation "ledger.holding" does not exist'));
    const requestId = res.headers.get('X-Request-Id');
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.requestId).toBe(requestId);
    expect(body.error.message).toContain(requestId);
    expect(JSON.stringify(body)).not.toContain('ledger.holding');
    expect(logged.join('\n')).not.toContain('ledger.holding');
  });

  it('treats a deliberate INTERNAL like an unexpected one', async () => {
    const { res, body } = await errorFrom(new AppError('INTERNAL', 'database timed out'));
    expect(res.status).toBe(500);
    expect(body.error.message).not.toContain('database');
    expect(body.error.requestId).toBe(res.headers.get('X-Request-Id'));
  });

  it('maps Hono’s own 400 to VALIDATION_FAILED', async () => {
    const { res, body } = await errorFrom(
      new HTTPException(400, { message: 'Malformed JSON in request body' }),
    );
    expect(res.status).toBe(400);
    expect(body.error).toStrictEqual({
      code: 'VALIDATION_FAILED',
      message: 'Malformed JSON in request body',
    });
  });

  it('passes through a deliberate HTTPException that has no code, with its headers', async () => {
    const res = await appThrowing(
      new HTTPException(401, {
        res: new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer' },
        }),
      }),
    ).request('/boom');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('logs only whitelisted fields for a failure', async () => {
    await errorFrom(new Error('secret detail'));
    const failure = logged
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === 'request_failed');
    expect(failure).toMatchObject({ route: 'GET /boom', status: 500, errorCode: 'INTERNAL' });
    expect(Object.keys(failure ?? {}).sort()).toStrictEqual(
      ['errorCode', 'event', 'requestId', 'route', 'status'].sort(),
    );
  });
});
