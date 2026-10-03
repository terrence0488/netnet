import { Hono } from 'hono';
import { contentStore } from './content/store';
import { contentRoutes } from './http/content';
import type { AppEnv } from './lib/context';
import { handleError, handleNotFound } from './lib/error-handler';
import { noStore, requestContext } from './lib/request-context';

/** The one Hono app behind /api, /mcp and /.well-known (architecture §7.1). */
export const app = new Hono<AppEnv>();

app.use('*', requestContext(), noStore());

/** Shallow by design: an uptime monitor must never wake the database. */
app.get('/api/health', (c) => c.json({ ok: true }));

/** Published content: no user data, no session (architecture §7.2). */
app.route('/api/content', contentRoutes(contentStore));

app.notFound(handleNotFound);
app.onError(handleError);
