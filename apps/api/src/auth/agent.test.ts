import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAKS,
  captureLog,
  drizzleFailure,
  plainFailure,
  type CapturedLog,
} from '../../test/support/failures';
import { captureWaitUntil, type CapturedWaitUntil } from '../../test/support/wait-until';
import { agentBackground } from './agent';

describe('agentBackground()', () => {
  let log: CapturedLog;
  let vercel: CapturedWaitUntil;

  beforeEach(() => {
    log = captureLog();
    vercel = captureWaitUntil();
  });

  afterEach(() => {
    vercel.restore();
    vi.restoreAllMocks();
  });

  it('logs a failed task with its class and SQLSTATE, never its message, SQL or values', async () => {
    agentBackground(Promise.reject(drizzleFailure()));
    agentBackground(Promise.reject(plainFailure()));
    agentBackground(Promise.resolve());
    await vercel.settle();
    expect(log.of('agent_task_failed')).toStrictEqual([
      {
        event: 'agent_task_failed',
        errorCode: 'INTERNAL',
        errorName: 'DrizzleQueryError',
        pgCode: '23505',
      },
      { event: 'agent_task_failed', errorCode: 'INTERNAL', errorName: 'TypeError' },
    ]);
    expect(log.raw().join('\n')).not.toMatch(LEAKS);
  });
});
