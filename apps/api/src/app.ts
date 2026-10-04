import { Hono } from 'hono';
import { auth } from './auth/auth';
import { originCheck } from './auth/origin-check';
import { authRoutes } from './auth/routes';
import { sessionFromCookie } from './auth/session';
import { contentStore } from './content/store';
import { contentRoutes } from './http/content';
import { eventsRoutes } from './http/events';
import { geoRoutes } from './http/geo';
import { holdingsRoutes } from './http/holdings';
import { liveCountries, meRoutes } from './http/me';
import { prefsRoutes } from './http/prefs';
import { snapshotRoutes } from './http/snapshot';
import { tagsRoutes } from './http/tags';
import { typesRoutes } from './http/types';
import { valuesRoutes } from './http/values';
import { cronAuth, cronSecret } from './jobs/cron';
import { defaultFxJob } from './jobs/fx';
import type { AppEnv } from './lib/context';
import { appOrigins } from './lib/env';
import { handleError, handleNotFound } from './lib/error-handler';
import { noStore, requestContext } from './lib/request-context';
import { sessionContext } from './lib/session';

/** The one Hono app behind /api, /mcp and /.well-known (architecture §7.1). */
export const app = new Hono<AppEnv>();

/**
 * Every state-changing request to the REST API comes from NetNet's own pages (§8), and the session
 * is read from its cookie when a route first asks.
 */
app.use(
  '*',
  requestContext(),
  noStore(),
  originCheck(appOrigins),
  sessionContext(sessionFromCookie(auth)),
);

/** Shallow by design: an uptime monitor must never wake the database. */
app.get('/api/health', (c) => c.json({ ok: true }));

/** Sign-up, sign-in, verification, reset and sign-out: Better Auth, rate-limited (§7.2, §8). */
app.route('/api/auth', authRoutes());

app.route('/api/me', meRoutes());
app.route('/api/geo', geoRoutes(liveCountries(contentStore)));

app.route('/api/events', eventsRoutes());

/** The person's position and every P1 write, over the Ledger (architecture §7.2). */
app.route('/api/snapshot', snapshotRoutes());
app.route('/api/holdings', holdingsRoutes());
app.route('/api', valuesRoutes());
app.route('/api/types', typesRoutes());
app.route('/api/tags', tagsRoutes());
app.route('/api/prefs', prefsRoutes());

/** Published content: no user data, no session (architecture §7.2). */
app.route('/api/content', contentRoutes(contentStore));

/** Vercel Cron calls these with GET and the bearer secret (architecture §9.3). */
app.use('/api/cron/*', cronAuth(cronSecret));
app.get('/api/cron/fx', defaultFxJob());

app.notFound(handleNotFound);
app.onError(handleError);
