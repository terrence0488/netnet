import { Hono } from 'hono';
import { eventsRoutes } from './http/events';
import type { AppEnv } from './lib/context';
import { handleError, handleNotFound } from './lib/error-handler';
import { noStore, requestContext } from './lib/request-context';
import { noSession, sessionContext } from './lib/session';

/** The one Hono app behind /api, /mcp and /.well-known (architecture §7.1). */
export const app = new Hono<AppEnv>();

// Sessions arrive with P1-T11, which swaps `noSession` for its resolver.
app.use('*', requestContext(), noStore(), sessionContext(noSession));

/** Shallow by design: an uptime monitor must never wake the database. */
app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/events', eventsRoutes());

app.notFound(handleNotFound);
app.onError(handleError);
