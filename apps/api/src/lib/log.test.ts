import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { errorClass, log, type LogFields } from './log';

describe('log', () => {
  let out: MockInstance<typeof console.log>;
  let err: MockInstance<typeof console.error>;

  beforeEach(() => {
    out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('writes one JSON line with the whitelisted fields', () => {
    log('request', {
      requestId: 'req_1',
      route: 'GET /api/health',
      tool: 'get_financial_context',
      status: 200,
      latencyMs: 12,
      userId: 'usr_1',
      connectionId: 'con_1',
      errorName: 'DrizzleQueryError',
      pgCode: '23505',
      bytes: 2048,
      gzipBytes: 512,
      valueCount: 40,
    });
    expect(out).toHaveBeenCalledOnce();
    expect(JSON.parse(String(out.mock.calls[0]?.[0]))).toStrictEqual({
      event: 'request',
      requestId: 'req_1',
      route: 'GET /api/health',
      tool: 'get_financial_context',
      status: 200,
      latencyMs: 12,
      userId: 'usr_1',
      connectionId: 'con_1',
      errorName: 'DrizzleQueryError',
      pgCode: '23505',
      bytes: 2048,
      gzipBytes: 512,
      valueCount: 40,
    });
  });

  it('sends server errors to stderr', () => {
    log('request_failed', { status: 500, errorCode: 'INTERNAL' });
    expect(err).toHaveBeenCalledOnce();
    expect(out).not.toHaveBeenCalled();
  });

  it.each([
    ['an amount', { amount: 1200 }],
    ['an email', { email: 'someone@example.com' }],
    ['a body', { body: '{"name":"Savings"}' }],
  ])('rejects %s outside production', (_, fields) => {
    expect(() => log('request', fields as LogFields)).toThrow(/is not allowed/);
    expect(out).not.toHaveBeenCalled();
  });

  it('rejects a whitelisted field with the wrong type or an overlong value', () => {
    expect(() => log('request', { status: '200' } as unknown as LogFields)).toThrow(
      /must be a number/,
    );
    expect(() => log('request', { userId: { name: 'x' } } as unknown as LogFields)).toThrow(
      /must be a string/,
    );
    expect(() => log('request', { route: 'x'.repeat(201) })).toThrow(/longer than/);
  });

  it.each([
    ['a message', 'relation "ledger.holding" does not exist'],
    ['a holding name and an amount', 'Savings 1200'],
    ['an email', 'someone@example.com'],
    ['SQL', 'select*from'],
    ['an overlong name', `E${'x'.repeat(64)}`],
    ['nothing', ''],
  ])('rejects an errorName that is %s, not a class name', (_, errorName) => {
    expect(() => log('request_failed', { errorName })).toThrow(/"errorName" must match/);
    expect(out).not.toHaveBeenCalled();
  });

  it.each([
    ['a message', 'duplicate key value violates unique constraint'],
    ['four characters', '2350'],
    ['six characters', '235050'],
    ['padded', ' 23505'],
    ['lowercase', '42p01'],
    ['an amount', '1,200'],
  ])('rejects a pgCode that is %s, not a SQLSTATE', (_, pgCode) => {
    expect(() => log('request_failed', { pgCode })).toThrow(/"pgCode" must match/);
    expect(out).not.toHaveBeenCalled();
  });

  it('writes the error class errorClass() gives as it is', () => {
    const drizzle = new DrizzleQueryError('select 1', [], postgresError('40P01', 'deadlock'));
    log('request_failed', { status: 500, ...errorClass(drizzle) });
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toStrictEqual({
      event: 'request_failed',
      status: 500,
      errorName: 'DrizzleQueryError',
      pgCode: '40P01',
    });
  });

  it('rejects an event name that is not snake_case', () => {
    expect(() => log('Saved holding Savings')).toThrow(/snake_case/);
  });

  it('drops unknown fields in production and writes the rest', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    log('request', { requestId: 'req_1', amount: 1200 } as LogFields);
    expect(JSON.parse(String(out.mock.calls[0]?.[0]))).toStrictEqual({
      event: 'request',
      requestId: 'req_1',
    });
  });

  it('drops a malformed errorName or pgCode in production and writes the rest', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    log('request_failed', { requestId: 'req_1', errorName: 'Savings 1200', pgCode: 'oops!' });
    expect(JSON.parse(String(out.mock.calls[0]?.[0]))).toStrictEqual({
      event: 'request_failed',
      requestId: 'req_1',
    });
  });
});

/** A Postgres error as the driver builds it: its message, SQLSTATE and detail. */
function postgresError(code: string, message: string): DatabaseError {
  const error = new DatabaseError(message, message.length, 'error');
  error.severity = 'ERROR';
  error.code = code;
  error.detail = 'Key (user_id)=(usr_01K1G4KX00AAAAAAAAAAAAAAAA) already exists.';
  return error;
}

describe('errorClass', () => {
  it('names the class of an error, never its message', () => {
    expect(errorClass(new TypeError('Cannot read "Savings"'))).toStrictEqual({
      errorName: 'TypeError',
    });
    class ProfileMissing extends Error {}
    expect(errorClass(new ProfileMissing('no profile for someone@example.com'))).toStrictEqual({
      errorName: 'ProfileMissing',
    });
  });

  it('finds the SQLSTATE of a Postgres error, through Drizzle’s wrapper and further causes', () => {
    const postgres = postgresError('23505', 'duplicate key value violates unique constraint');
    expect(errorClass(postgres)).toStrictEqual({ errorName: 'DatabaseError', pgCode: '23505' });
    const drizzle = new DrizzleQueryError('insert into "core"."profile" …', ['usr_1'], postgres);
    expect(errorClass(drizzle)).toStrictEqual({ errorName: 'DrizzleQueryError', pgCode: '23505' });
    const outer = new Error('the profile could not be made', { cause: drizzle });
    expect(errorClass(outer)).toStrictEqual({ errorName: 'Error', pgCode: '23505' });
  });

  it('takes no code that is not a SQLSTATE from Postgres', () => {
    const system = Object.assign(new Error('write EPIPE'), { code: 'EPIPE', errno: -32 });
    expect(errorClass(system)).toStrictEqual({ errorName: 'Error' });
    const forged = Object.assign(new Error('x'), { code: 'Savings 1200', severity: 'ERROR' });
    expect(errorClass(forged)).toStrictEqual({ errorName: 'Error' });
  });

  it('leaves out a class name that is not an identifier', () => {
    class Named extends Error {}
    Object.defineProperty(Named, 'name', { value: 'Savings 1200 SGD' });
    expect(errorClass(new Named('x'))).toStrictEqual({});
    expect(errorClass(Object.create(null))).toStrictEqual({});
  });

  it('gives nothing for a thrown value that is not an object, or one that throws when read', () => {
    expect(errorClass('relation "ledger.holding" does not exist')).toStrictEqual({});
    expect(errorClass(undefined)).toStrictEqual({});
    const hostile = new Proxy(new Error('x'), {
      getPrototypeOf: () => {
        throw new Error('no');
      },
    });
    expect(errorClass(hostile)).toStrictEqual({});
  });

  it('stops on a cause chain that loops', () => {
    const a: Error = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(errorClass(a)).toStrictEqual({ errorName: 'Error' });
  });
});
