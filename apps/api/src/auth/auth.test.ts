import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAKS,
  captureLog,
  drizzleFailure,
  plainFailure,
  type CapturedLog,
} from '../../test/support/failures';
import { captureWaitUntil } from '../../test/support/wait-until';
import { authBackground, logAuthError, withoutSessionToken } from './auth';

describe('withoutSessionToken()', () => {
  it('takes the token out of sign-up and sign-in bodies, and keeps the rest', () => {
    expect(withoutSessionToken({ token: 'abc', user: { id: 'usr_1' } })).toStrictEqual({
      user: { id: 'usr_1' },
    });
    expect(
      withoutSessionToken({ redirect: false, token: 'abc', url: undefined, user: { id: 'u' } }),
    ).toStrictEqual({ redirect: false, url: undefined, user: { id: 'u' } });
  });

  it('takes it out of get-session’s session', () => {
    expect(
      withoutSessionToken({
        session: { id: 's', token: 'abc', expiresAt: 'x' },
        user: { id: 'u' },
      }),
    ).toStrictEqual({ session: { id: 's', expiresAt: 'x' }, user: { id: 'u' } });
  });

  it('leaves anything else as it is', () => {
    expect(withoutSessionToken(null)).toBeNull();
    expect(withoutSessionToken([1])).toStrictEqual([1]);
    expect(withoutSessionToken({ status: true })).toStrictEqual({ status: true });
  });
});

describe('the failure logs', () => {
  let log: CapturedLog;

  beforeEach(() => {
    log = captureLog();
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs an error Better Auth reports with its class, never its message or arguments', () => {
    logAuthError('error', 'INTERNAL_SERVER_ERROR', drizzleFailure());
    logAuthError('error', 'Failed to sign in kestrel@example.com', {
      email: 'kestrel@example.com',
    });
    logAuthError('error', plainFailure());
    logAuthError('error', 'Introspection error:', 'Cannot read kestrel', 'at Kestrel (x.ts:1)');
    expect(log.of('auth_error')).toStrictEqual([
      {
        event: 'auth_error',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
      { event: 'auth_error', errorCode: 'INTERNAL' },
      { event: 'auth_error', errorCode: 'INTERNAL', errorName: 'TypeError' },
      { event: 'auth_error', errorCode: 'INTERNAL' },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });

  it('names Better Auth’s own errors, and logs nothing below error', () => {
    logAuthError('error', 500, new APIError('INTERNAL_SERVER_ERROR', { message: 'kestrel' }));
    logAuthError('warn', 'kestrel@example.com', plainFailure());
    logAuthError('info', 'kestrel@example.com');
    expect(log.lines()).toStrictEqual([
      { event: 'auth_error', errorCode: 'INTERNAL', errorName: 'APIError' },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });

  it('logs a failed background task with its class and SQLSTATE', async () => {
    const vercel = captureWaitUntil();
    try {
      authBackground(Promise.reject(drizzleFailure()));
      authBackground(Promise.reject(plainFailure()));
      authBackground(Promise.resolve());
      await vercel.settle();
    } finally {
      vercel.restore();
    }
    expect(log.of('auth_task_failed')).toStrictEqual([
      {
        event: 'auth_task_failed',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
      { event: 'auth_task_failed', errorCode: 'INTERNAL', errorName: 'TypeError' },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });
});
