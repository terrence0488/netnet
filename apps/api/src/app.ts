import { Hono } from 'hono';
import { auth } from './auth/auth';
import { wellKnownRoutes } from './auth/oauth-routes';
import { originCheck } from './auth/origin-check';
import { authRoutes } from './auth/routes';
import { sessionFromCookie } from './auth/session';
import { touchCheckedOnSession } from './auth/touch-checked';
import { contentStore } from './content/store';
import { accountRoutes } from './http/account';
import { activityRoutes } from './http/activity';
import { agentRoutes } from './http/agent';
import { contentRoutes } from './http/content';
import { eventsRoutes } from './http/events';
import { exportRoutes } from './http/export';
import { geoRoutes } from './http/geo';
import { holdingsRoutes } from './http/holdings';
import { liveCountries, meRoutes } from './http/me';
import { mcpRoutes } from './mcp/route';
import { notificationsRoutes } from './http/notifications';
import { prefsRoutes } from './http/prefs';
import { remindersRoutes } from './http/reminders';
import { snapshotRoutes } from './http/snapshot';
import { tagsRoutes } from './http/tags';
import { typesRoutes } from './http/types';
import { valuesRoutes } from './http/values';
import { cronAuth, cronSecret } from './jobs/cron';
import { dailyJob } from './jobs/daily';
import { defaultFxJob } from './jobs/fx';
import { healthJob } from './jobs/health';
import { remindersJob } from './jobs/reminders';
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

/** The comeback reminder's clock: any session-authenticated `/api/*` request restarts it (§7.10). */
app.use('/api/*', touchCheckedOnSession());

/** Shallow by design: an uptime monitor must never wake the database. */
app.get('/api/health', (c) => c.json({ ok: true }));

/** Sign-up, sign-in, verification, reset and sign-out: Better Auth, rate-limited (§7.2, §8). */
app.route('/api/auth', authRoutes());

/** The agents' OAuth server's metadata (RFC 8414, RFC 9728), at the root (§7.1). */
app.route('/.well-known', wellKnownRoutes(auth));

/** Connection attempts, the approval page's API and the Agent tab (§7.2). */
app.route('/api/agent', agentRoutes());

/** The connector URL agents paste: the MCP server, stateless Streamable HTTP (§7.1, §7.4). */
app.route('/mcp', mcpRoutes());

app.route('/api/me', meRoutes());
app.route('/api/geo', geoRoutes(liveCountries(contentStore)));

/** The person's data to take away, and the account's deletion (PRD J10). */
app.route('/api/export', exportRoutes());
app.route('/api/account', accountRoutes());

app.route('/api/events', eventsRoutes());

/** The person's position and every P1 write, over the Ledger (architecture §7.2). */
app.route('/api/snapshot', snapshotRoutes());
app.route('/api/holdings', holdingsRoutes());
app.route('/api', valuesRoutes());
app.route('/api/types', typesRoutes());
app.route('/api/tags', tagsRoutes());
app.route('/api/prefs', prefsRoutes());
app.route('/api/activity', activityRoutes());

/** The Reminders switches, the VAPID key and the push endpoints (PRD J12, §7.2). */
app.route('/api/notifications', notificationsRoutes());

/** Published content: no user data, no session (architecture §7.2). */
app.route('/api/content', contentRoutes(contentStore));

/** The reminder's signed links: opened tracking and the one-click unsubscribe (§7.2, J12). */
app.route('/api/reminders', remindersRoutes());

/** GitHub Actions schedules call these with GET and the bearer secret (architecture §9.3). */
app.use('/api/cron/*', cronAuth(cronSecret));
app.get('/api/cron/fx', defaultFxJob());
app.get('/api/cron/daily', dailyJob());
app.get('/api/cron/reminders', remindersJob());
app.post('/api/cron/health', healthJob());

app.notFound(handleNotFound);
app.onError(handleError);
