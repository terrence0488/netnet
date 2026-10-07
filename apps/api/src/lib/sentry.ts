import * as Sentry from '@sentry/node';

/**
 * Error reporting (architecture §10): unexpected errors reach Sentry scrubbed, or stay in the
 * log when no DSN is set. `dataCollection` disables every automatic category (SDK v11 removed
 * `sendDefaultPii`; unset would collect bodies, cookies and query data by default); `beforeSend`
 * drops request bodies, query strings, breadcrumb text and emails. Errors only: no tracing, no
 * session replay.
 *
 * This scrub mirrors `apps/web/src/sentry.ts`: the two drop the same fields, and both are
 * tested. Change one, change the other.
 */

const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function redactEmails(text: string): string {
  return text.replace(EMAIL_LIKE, '[email]');
}

/** The URL without its query string or fragment, which can carry tokens and ids. */
function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * What Sentry may keep of an event (CONVENTIONS §6): the route-level facts, never amounts,
 * names, emails, bodies or query strings. Returns the event, scrubbed in place.
 */
export function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const { request } = event;
  if (request !== undefined) {
    if (typeof request.url === 'string') request.url = stripQuery(request.url);
    delete request.query_string;
    delete request.data;
    delete request.cookies;
    delete request.headers;
  }
  if (event.user !== undefined) {
    event.user = typeof event.user.id === 'string' ? { id: event.user.id } : {};
  }
  for (const crumb of event.breadcrumbs ?? []) {
    delete crumb.message;
    delete crumb.data;
  }
  if (typeof event.message === 'string') event.message = redactEmails(event.message);
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = redactEmails(value.value);
  }
  return event;
}

export function sentryInitOptions(): Sentry.NodeOptions {
  return {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    ...(process.env.VERCEL_GIT_COMMIT_SHA === undefined
      ? {}
      : { release: process.env.VERCEL_GIT_COMMIT_SHA }),
    // The brief's `sendDefaultPii: false`, in v11's granular form (see the v10-to-v11
    // migration guide's v10-default baseline, with query params and headers off entirely).
    dataCollection: {
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
    },
    beforeSend: (event) => scrubSentryEvent(event),
  };
}

let enabled = false;

/**
 * Starts Sentry when `SENTRY_DSN` is set (Vercel's environments hold it; local runs and tests
 * have none, so their errors stay in the log). Safe to call on every import of an entry point.
 */
export function initSentry(): void {
  if (enabled || !process.env.SENTRY_DSN) return;
  Sentry.init(sentryInitOptions());
  enabled = true;
}

/**
 * Reports an unexpected error with the request id and route only. A no-op until `initSentry`
 * has run with a DSN. The flush is awaited: a serverless function can freeze the moment its
 * response goes out, stranding an error that was only captured.
 */
export async function reportError(
  error: unknown,
  tags: { requestId: string; route: string },
): Promise<void> {
  if (!enabled) return;
  Sentry.captureException(error, { tags });
  await Sentry.flush(2000);
}
