import * as Sentry from '@sentry/react';

/**
 * Error reporting (architecture §10): uncaught errors reach Sentry scrubbed, or nowhere when no
 * DSN is set. `dataCollection` disables every automatic category (SDK v11 removed
 * `sendDefaultPii`; unset would collect bodies, cookies and query data by default); `beforeSend`
 * drops request bodies, query strings, breadcrumb text and emails, and replaces every exception
 * message with a fixed placeholder so no free text escapes. Errors only: no tracing, no session
 * replay.
 *
 * This scrub mirrors `apps/api/src/lib/sentry.ts`: the two drop the same fields, and both are
 * tested. Change one, change the other.
 */

/** What every exception message becomes: the class and stack remain, the text never does. */
const REDACTED = '[redacted by NetNet]';

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
 * What Sentry may keep of an event (CONVENTIONS §6): the error's class, its stack and the
 * page-level facts, never amounts, names, emails, bodies, query strings or free text. Exception
 * values carry server-supplied messages and SQL, so they become a fixed placeholder; `extra`
 * and `contexts` are dropped whole. Returns the event, scrubbed in place.
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
  delete event.extra;
  delete event.contexts;
  if (typeof event.message === 'string') event.message = redactEmails(event.message);
  for (const value of event.exception?.values ?? []) {
    value.value = REDACTED;
  }
  return event;
}

export function sentryInitOptions(): Sentry.BrowserOptions {
  return {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VERCEL_ENV ?? 'development',
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
    beforeBreadcrumb: (crumb) => {
      delete crumb.message;
      delete crumb.data;
      return crumb;
    },
  };
}

let enabled = false;

/**
 * Starts Sentry when the build carries `VITE_SENTRY_DSN`. Without it — local runs, and tests —
 * errors stay in the console. Safe to call on every load of the entry point.
 */
export function initSentry(): void {
  if (enabled || !import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.init(sentryInitOptions());
  enabled = true;
}
