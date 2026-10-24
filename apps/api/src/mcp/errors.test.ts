import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAKS,
  captureLog,
  drizzleFailure,
  plainFailure,
  type CapturedLog,
} from '../../test/support/failures';
import { ConnectionRevoked } from '../ledger/with-user';
import { AppError } from '../lib/errors';
import { toMcpError } from './errors';

const REQUEST_ID = 'req_01K1G4KX00AAAAAAAAAAAAAAAA';

let log: CapturedLog;

beforeEach(() => {
  log = captureLog();
});

afterEach(() => vi.restoreAllMocks());

describe('toMcpError()', () => {
  it('logs an unexpected error with its class and SQLSTATE, and answers INTERNAL', () => {
    const failed = toMcpError(drizzleFailure(), {}, REQUEST_ID, 'record_values');
    expect(failed.code).toBe('INTERNAL');
    expect(failed.body.error).toMatchObject({ code: 'INTERNAL', requestId: REQUEST_ID });
    expect(log.of('tool_failed')).toStrictEqual([
      {
        event: 'tool_failed',
        requestId: REQUEST_ID,
        tool: 'record_values',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
    expect(JSON.stringify(failed.body)).not.toMatch(LEAKS);
  });

  it('names an error with no SQLSTATE by its class alone', () => {
    toMcpError(plainFailure(), {}, REQUEST_ID, 'get_holding');
    expect(log.of('tool_failed')).toStrictEqual([
      {
        event: 'tool_failed',
        requestId: REQUEST_ID,
        tool: 'get_holding',
        errorCode: 'INTERNAL',
        errorName: 'TypeError',
      },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });

  it('logs nothing for a deliberate error or a revoked connection', () => {
    const notFound = toMcpError(
      new AppError('NOT_FOUND', 'No holding has that id.'),
      {},
      REQUEST_ID,
      'get_holding',
    );
    expect(notFound.code).toBe('NOT_FOUND');
    const revoked = toMcpError(new ConnectionRevoked('con_1'), {}, REQUEST_ID, 'get_holding');
    expect(revoked.code).toBe('UNAUTHENTICATED');
    expect(log.of('tool_failed')).toStrictEqual([]);
  });
});
