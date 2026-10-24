import { ERROR_CODES, ERROR_STATUS, errorBodySchema, type ErrorCode } from '@netnet/contracts';
import { DrizzleQueryError } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { DatabaseError } from 'pg';
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

/** A unique violation as Drizzle throws it: the driver's error, wrapped with the SQL and values. */
function uniqueViolation(): DrizzleQueryError {
  const postgres = new DatabaseError(
    'duplicate key value violates unique constraint "profile_pkey"',
    100,
    'error',
  );
  postgres.severity = 'ERROR';
  postgres.code = '23505';
  postgres.detail = 'Key (user_id)=(usr_01K1G4KX00AAAAAAAAAAAAAAAA) already exists.';
  return new DrizzleQueryError(
    'insert into "core"."profile" ("user_id", "time_zone") values ($1, $2)',
    ['usr_01K1G4KX00AAAAAAAAAAAAAAAA', 'Asia/Singapore'],
    postgres,
  );
}

describe('handleError', () => {
  /** Everything written to stdout and stderr, one entry per console call. */
  let written: unknown[][];

  function isLogLine(args: unknown[]): args is [string] {
    return args.length === 1 && typeof args[0] === 'string' && args[0].startsWith('{"event":');
  }

  /** The JSON lines log() wrote. */
  function logLines(): Record<string, unknown>[] {
    return written.filter(isLogLine).map(([line]) => JSON.parse(line) as Record<string, unknown>);
  }

  /** Whatever else was written: a stack, say. */
  function besideTheLog(): unknown[][] {
    return written.filter((args) => !isLogLine(args));
  }

  function failure(): Record<string, unknown> | undefined {
    return logLines().find((line) => line.event === 'request_failed');
  }

  beforeEach(() => {
    written = [];
    const capture = (...args: unknown[]) => void written.push(args);
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.stubEnv('SENTRY_DSN', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
    expect(JSON.stringify(logLines())).not.toContain('ledger.holding');
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
    expect(failure()).toMatchObject({
      route: 'GET /boom',
      status: 500,
      errorCode: 'INTERNAL',
      errorName: 'Error',
    });
    expect(Object.keys(failure() ?? {}).sort()).toStrictEqual(
      ['errorCode', 'errorName', 'event', 'requestId', 'route', 'status'].sort(),
    );
  });

  it('logs an unexpected error’s class and SQLSTATE, never its message, SQL or values', async () => {
    const { res } = await errorFrom(uniqueViolation());
    expect(failure()).toStrictEqual({
      event: 'request_failed',
      requestId: res.headers.get('X-Request-Id'),
      route: 'GET /boom',
      status: 500,
      errorCode: 'INTERNAL',
      errorName: 'DrizzleQueryError',
      pgCode: '23505',
    });
    const lines = JSON.stringify(logLines());
    for (const secret of ['duplicate key', 'profile_pkey', 'insert into', 'usr_01K1G4KX', 'Asia']) {
      expect(lines).not.toContain(secret);
    }
  });

  it('writes the stack to stderr when no Sentry DSN is set', async () => {
    const error = uniqueViolation();
    await errorFrom(error);
    expect(console.error).toHaveBeenCalledWith(error);
    expect(besideTheLog()).toStrictEqual([[error]]);
    expect(error.stack).toContain('error-handler.test.ts');
  });

  it('writes nothing besides the log line when a Sentry DSN is set', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@sentry.example/1');
    await errorFrom(uniqueViolation());
    expect(besideTheLog()).toStrictEqual([]);
    expect(failure()).toMatchObject({ errorName: 'DrizzleQueryError', pgCode: '23505' });
  });

  it('never writes the stack in production, even without a DSN', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    await errorFrom(uniqueViolation());
    expect(besideTheLog()).toStrictEqual([]);
    expect(failure()).toMatchObject({ errorName: 'DrizzleQueryError', pgCode: '23505' });
  });

  it('writes nothing to stderr for a deliberate error', async () => {
    await errorFrom(new AppError('NOT_FOUND', 'No such holding.'));
    expect(console.error).not.toHaveBeenCalled();
    expect(besideTheLog()).toStrictEqual([]);
  });
});
