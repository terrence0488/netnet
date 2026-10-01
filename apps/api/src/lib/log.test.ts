import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { log, type LogFields } from './log';

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
});
