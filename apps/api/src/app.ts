import { Hono } from 'hono';
import { originCheck } from './auth/origin-check';
import { contentStore } from './content/store';
import { contentRoutes } from './http/content';
import { eventsRoutes } from './http/events';
import { cronAuth, cronSecret } from './jobs/cron';
import { defaultFxJob } from './jobs/fx';
import type { AppEnv } from './lib/context';
import { appOrigins } from './lib/env';
import { handleError, handleNotFound } from './lib/error-handler';
import { noStore, requestContext } from './lib/request-context';
import { noSession, sessionContext } from './lib/session';

/** The one Hono app behind /api, /mcp and /.well-known (architecture §7.1). */
export const app = new Hono<AppEnv>();

// Every state-changing request to the REST API comes from NetNet's own pages (§8). Sessions
// arrive with P1-T11, which swaps `noSession` for its resolver.
app.use('*', requestContext(), noStore(), originCheck(appOrigins), sessionContext(noSession));

/** Shallow by design: an uptime monitor must never wake the database. */
app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/events', eventsRoutes());

/** Published content: no user data, no session (architecture §7.2). */
app.route('/api/content', contentRoutes(contentStore));

/** Vercel Cron calls these with GET and the bearer secret (architecture §9.3). */
app.use('/api/cron/*', cronAuth(cronSecret));
app.get('/api/cron/fx', defaultFxJob());

app.notFound(handleNotFound);
app.onError(handleError);
