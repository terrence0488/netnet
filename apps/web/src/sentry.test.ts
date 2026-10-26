import { describe, expect, it } from 'vitest';
import { scrubSentryEvent, sentryInitOptions } from './sentry';

/** Fictional PII the scrub must never let through, in every shape Sentry carries. */
const AMOUNT = '7092.44';
const HOLDING = 'Clearwater Bond Ladder';
const EMAIL = 'theo-friend@example.com';
const REDACTED = '[redacted by NetNet]';

/** H-1's probe: an error whose message carries SQL and holding-name/amount parameters. */
const DRIZZLE_SQL =
  'Failed query: insert into "ledger"."holding" ("name", "amount_minor") values ($1, $2) ' +
  'params: Harborview Global Index Fund,2384117';

function tainted() {
  return scrubSentryEvent({
    type: undefined,
    message: `welcome ${EMAIL}`,
    request: {
      url: `https://netnet.example/app/holdings?email=${EMAIL}`,
      query_string: `email=${EMAIL}`,
      // A thrown-with body holding a fictional amount and holding name.
      data: { amount: AMOUNT, holding: HOLDING },
      cookies: { session: 'abc' },
      headers: { Cookie: 'session=abc' },
    },
    user: { id: 'usr_01JBBB', email: EMAIL, username: EMAIL },
    breadcrumbs: [{ category: 'ui.click', message: `opened ${HOLDING}`, data: { amount: AMOUNT } }],
    extra: { amount: AMOUNT, holding: HOLDING, note: 'free text' },
    contexts: { holding: { name: HOLDING, amount: AMOUNT } },
    exception: { values: [{ type: 'Error', value: `render failed for ${EMAIL}` }] },
  });
}

describe('Sentry scrubbing', () => {
  it('lets neither a body amount, a holding name nor an email reach the transport', () => {
    const scrubbed = JSON.stringify(tainted());
    expect(scrubbed).not.toContain(AMOUNT);
    expect(scrubbed).not.toContain(HOLDING);
    expect(scrubbed).not.toContain(EMAIL);
  });

  it('drops request bodies, query strings, cookies, headers and breadcrumb text', () => {
    const event = tainted();
    expect(event?.request?.url).toBe('https://netnet.example/app/holdings');
    expect(event?.request).not.toHaveProperty('query_string');
    expect(event?.request).not.toHaveProperty('data');
    expect(event?.request).not.toHaveProperty('cookies');
    expect(event?.request).not.toHaveProperty('headers');
    expect(event?.breadcrumbs?.[0]).not.toHaveProperty('message');
    expect(event?.breadcrumbs?.[0]).not.toHaveProperty('data');
    expect(event?.breadcrumbs?.[0]?.category).toBe('ui.click');
    expect(event).not.toHaveProperty('extra');
    expect(event).not.toHaveProperty('contexts');
  });

  it('redacts the H-1 probe: no SQL or bound parameters reach Sentry', () => {
    const event = scrubSentryEvent({
      type: undefined,
      exception: {
        values: [
          {
            type: 'DrizzleQueryError',
            value: DRIZZLE_SQL,
            stacktrace: {
              frames: [{ filename: 'apps/web/src/lib/api.ts', function: 'request', lineno: 88 }],
            },
          },
        ],
      },
    });
    const value = event?.exception?.values?.[0];
    expect(value?.value).toBe(REDACTED);
    expect(value?.type).toBe('DrizzleQueryError');
    expect(value?.stacktrace?.frames?.[0]?.filename).toBe('apps/web/src/lib/api.ts');
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('Harborview Global Index Fund,2384117');
    expect(serialized).not.toContain('params:');
    expect(serialized).not.toContain('insert into');
  });

  it('keeps the user id but no email or username, and redacts emails in text', () => {
    const event = tainted();
    expect(event?.user).toStrictEqual({ id: 'usr_01JBBB' });
    expect(event?.message).toBe('welcome [email]');
    expect(event?.exception?.values?.[0]?.value).toBe(REDACTED);
    expect(event?.exception?.values?.[0]?.type).toBe('Error');
  });

  it('initializes with automatic collection off, scrubbing on, and no tracing or replay', () => {
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
    expect(options.beforeBreadcrumb).toBeDefined();
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.replaysSessionSampleRate).toBeUndefined();
    expect(options.replaysOnErrorSampleRate).toBeUndefined();
  });

  it('scrubs a breadcrumb at capture time too', () => {
    const crumb = sentryInitOptions().beforeBreadcrumb?.(
      { category: 'fetch', message: `loaded ${HOLDING}`, data: { amount: AMOUNT } },
      {},
    );
    expect(crumb).not.toHaveProperty('message');
    expect(crumb).not.toHaveProperty('data');
    expect(JSON.stringify(crumb)).not.toContain(HOLDING);
    expect(JSON.stringify(crumb)).not.toContain(AMOUNT);
  });

  it('tolerates a bare event with nothing to scrub', () => {
    expect(scrubSentryEvent({ type: undefined, message: 'plain' })?.message).toBe('plain');
  });
});
