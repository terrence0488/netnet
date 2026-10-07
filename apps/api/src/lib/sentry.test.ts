import { captureException, flush } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initSentry, reportError, scrubSentryEvent, sentryInitOptions } from './sentry';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
}));

/** Fictional PII the scrub must never let through, in every shape Sentry carries. */
const AMOUNT = '23841.17';
const HOLDING = 'Harborview Global Index Fund';
const EMAIL = 'marina-friend@example.com';

function tainted() {
  return scrubSentryEvent({
    type: undefined,
    message: `notify ${EMAIL} failed`,
    request: {
      url: `https://netnet.example/api/holdings?verbose=true&email=${EMAIL}`,
      method: 'POST',
      query_string: 'verbose=true',
      // A thrown-with body holding a fictional amount and holding name.
      data: { amount: AMOUNT, holding: HOLDING },
      cookies: { session: 'abc' },
      headers: { Authorization: 'Bearer [REDACTED]', 'User-Agent': 'probe' },
    },
    user: { id: 'usr_01JAAA', email: EMAIL, username: EMAIL },
    breadcrumbs: [
      { category: 'mcp', message: `recorded ${AMOUNT} for ${HOLDING}`, data: { amount: AMOUNT } },
    ],
    exception: { values: [{ type: 'Error', value: `could not notify ${EMAIL}` }] },
  });
}

describe('Sentry scrubbing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('lets neither a body amount, a holding name nor an email reach the transport', () => {
    const scrubbed = JSON.stringify(tainted());
    expect(scrubbed).not.toContain(AMOUNT);
    expect(scrubbed).not.toContain(HOLDING);
    expect(scrubbed).not.toContain(EMAIL);
  });

  it('drops request bodies, query strings, cookies, headers and breadcrumb text', () => {
    const event = tainted();
    expect(event?.request?.url).toBe('https://netnet.example/api/holdings');
    expect(event?.request).not.toHaveProperty('query_string');
    expect(event?.request).not.toHaveProperty('data');
    expect(event?.request).not.toHaveProperty('cookies');
    expect(event?.request).not.toHaveProperty('headers');
    expect(event?.breadcrumbs?.[0]).not.toHaveProperty('message');
    expect(event?.breadcrumbs?.[0]).not.toHaveProperty('data');
    expect(event?.breadcrumbs?.[0]?.category).toBe('mcp');
  });

  it('keeps the user id but no email or username, and redacts emails in text', () => {
    const event = tainted();
    expect(event?.user).toStrictEqual({ id: 'usr_01JAAA' });
    expect(event?.message).toBe('notify [email] failed');
    expect(event?.exception?.values?.[0]?.value).toBe('could not notify [email]');
  });

  it('initializes with automatic collection off, scrubbing on, and no tracing or replay', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.com/1');
    const options = sentryInitOptions();
    expect(options.dataCollection).toStrictEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
    });
    expect(options.beforeSend).toBeDefined();
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.integrations).toBeUndefined();
  });

  it('reports nothing until Sentry is initialized with a DSN', async () => {
    await expect(
      reportError(new Error('boom'), { requestId: 'req_x', route: 'GET /' }),
    ).resolves.toBeUndefined();
    expect(captureException).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  // Last: it enables the module's Sentry for the rest of the file.
  it('flushes the captured error before its promise resolves', async () => {
    let release!: (sent: boolean) => void;
    vi.mocked(flush).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubEnv('SENTRY_DSN', 'https://public@example.com/1');
    initSentry();
    const pending = reportError(new Error('boom'), { requestId: 'req_x', route: 'GET /' });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
    let settled = false;
    const observed = pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    release(true);
    await observed;
    expect(settled).toBe(true);
  });

  it('tolerates a bare event with nothing to scrub', () => {
    expect(scrubSentryEvent({ type: undefined, message: 'plain' })?.message).toBe('plain');
  });
});
