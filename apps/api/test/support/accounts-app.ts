import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentGuide, Countries } from '@netnet/contracts';
import { Hono } from 'hono';
import { createAgent, type Agent } from '../../src/auth/agent';
import { createAuth, type Auth } from '../../src/auth/auth';
import type { GuideHosts, LoadGuideHosts } from '../../src/auth/classify';
import type { SocialConfig } from '../../src/auth/social';
import { wellKnownRoutes } from '../../src/auth/oauth-routes';
import { originCheck } from '../../src/auth/origin-check';
import { authRoutes } from '../../src/auth/routes';
import { sessionFromCookie } from '../../src/auth/session';
import { eventStore } from '../../src/db/analytics';
import { accountOf } from '../../src/db/profiles';
import { countHit } from '../../src/db/rate-limits';
import { createTrack } from '../../src/events/track';
import { agentRoutes } from '../../src/http/agent';
import { eventsRoutes } from '../../src/http/events';
import { geoRoutes } from '../../src/http/geo';
import { meRoutes } from '../../src/http/me';
import { cronAuth } from '../../src/jobs/cron';
import { dailyJob } from '../../src/jobs/daily';
import { baseCurrencyOf } from '../../src/ledger/base-currency';
import type { AppEnv } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { createRateLimit } from '../../src/lib/rate-limit';
import { noStore, requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';
import type { EmailChannel } from '../../src/notify/channel';
import { captureChannel, type CaptureChannel } from '../../src/notify/email';
import { createNotify } from '../../src/notify/notify';
import { FIXED_NOW, type TestDatabase } from '../isolation/harness';
import { FakeMetadataServer } from './cimd-server';
import { captureWaitUntil } from './wait-until';

/**
 * The accounts and agent routes wired as app.ts wires them, over a test database: Better Auth and
 * its OAuth server as `netnet_app`, CIMD documents from a local fake server, emails captured
 * (never sent; `emailDown` makes every send fail), events written to the test database, and the
 * rate limits and connection attempts on a clock the test moves.
 */

/** Where the fictional web app runs. */
export const ORIGIN = 'http://localhost:5173';

/** A test-only secret: 32 bytes of nothing in particular. */
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

/** The cron routes' secret in tests. */
export const CRON_SECRET = 'test-cron-secret';

/** The named guides' `matchHosts`, read from the repo's own `content/agents/`. */
export function repoGuideHosts(): GuideHosts[] {
  const dir = join(import.meta.dirname, '..', '..', '..', '..', 'content', 'agents');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as AgentGuide)
    .flatMap((guide) =>
      (guide.id === 'claude' || guide.id === 'chatgpt') && guide.matchHosts
        ? [{ client: guide.id, hosts: guide.matchHosts }]
        : [],
    );
}

/** A small country list: two with a pack, one without. */
export const COUNTRIES: Countries = {
  FR: { currency: 'EUR' },
  MY: { currency: 'MYR', pack: 'my' },
  SG: { currency: 'SGD', pack: 'sg' },
};

export interface AccountsApp {
  app: Hono<AppEnv>;
  auth: Auth;
  agent: Agent;
  emails: CaptureChannel;
  /** While true, every email send fails, as when Resend is down. */
  emailDown: { value: boolean };
  /** Where agents' CIMD documents are served from. */
  cimd: FakeMetadataServer;
  /** The rate limits' and the connection attempts' clock. */
  clock: { now: Date };
  /** Awaits the work handed to run after responses: emails and events. */
  settle(): Promise<void>;
}

export function accountsApp(
  db: TestDatabase,
  options: { guides?: LoadGuideHosts; social?: SocialConfig } = {},
): AccountsApp {
  const emails = captureChannel();
  const emailDown = { value: false };
  const email: EmailChannel = {
    id: 'email',
    send: (to, rendered) =>
      emailDown.value ? Promise.resolve({ ok: false, status: 503 }) : emails.send(to, rendered),
  };
  const cimd = new FakeMetadataServer();
  const clock = { now: FIXED_NOW };
  const pending: Promise<unknown>[] = [];
  const background = (task: Promise<unknown>) => void pending.push(task);
  // What routes hand to `afterResponse` (Vercel's waitUntil) too.
  const afterResponses = captureWaitUntil();
  const notify = createNotify(() => ({
    recipient: (userId) => accountOf(db.appDb, userId),
    email,
    origin: ORIGIN,
  }));
  const track = createTrack(() => ({ store: eventStore(db.appDb), clock: () => clock.now }));
  const rateLimit = createRateLimit(() => ({
    count: (key, windowStart) => countHit(db.appDb, key, windowStart),
    clock: () => clock.now,
  }));
  const auth = createAuth({
    db: db.appDb,
    secret: SECRET,
    origin: ORIGIN,
    trustedOrigins: [ORIGIN],
    notify,
    track,
    appVersion: () => 'test123',
    background,
    fetchClientMetadata: cimd.fetch,
    ...(options.social ? { social: options.social } : {}),
  });
  const agent = createAgent({
    db: () => db.appDb,
    clock: () => clock.now,
    track,
    appVersion: () => 'test123',
    background,
    auth: () => auth,
    origin: () => ORIGIN,
    guides: options.guides ?? (() => Promise.resolve(repoGuideHosts())),
    withUser: db.withUserOn(db.app, () => clock.now),
    notify,
  });
  const countries = () => Promise.resolve(COUNTRIES);

  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    noStore(),
    originCheck(() => [ORIGIN]),
    sessionContext(sessionFromCookie(() => auth)),
  );
  app.route(
    '/api/auth',
    authRoutes({
      auth: () => auth,
      rateLimit,
      origin: () => ORIGIN,
      agent: () => agent,
      db: () => db.appDb,
    }),
  );
  app.route(
    '/.well-known',
    wellKnownRoutes(() => auth),
  );
  app.route(
    '/api/agent',
    agentRoutes(() => agent),
  );
  app.route(
    '/api/me',
    meRoutes({
      db: () => db.appDb,
      baseCurrency: (userId) => baseCurrencyOf(db.withUser, userId),
      countries,
      // These suites are about the profile; making the ledger is test/http's (me-init).
      initLedger: () => Promise.resolve(),
      changeLedgerCountry: () => Promise.resolve(),
    }),
  );
  app.route('/api/geo', geoRoutes(countries));
  app.route('/api/events', eventsRoutes({ track, rateLimit, appVersion: () => 'test123' }));
  app.use(
    '/api/cron/*',
    cronAuth(() => CRON_SECRET),
  );
  app.get(
    '/api/cron/daily',
    dailyJob(() => agent),
  );
  app.notFound(handleNotFound);
  app.onError(handleError);

  return {
    app,
    auth,
    agent,
    emails,
    emailDown,
    cimd,
    clock,
    async settle() {
      while (pending.length > 0 || afterResponses.pending > 0) {
        await Promise.allSettled(pending.splice(0));
        await afterResponses.settle();
      }
    },
  };
}

export interface SendOptions {
  method?: string;
  /** Sent as JSON. */
  json?: unknown;
  headers?: Record<string, string>;
  /** Default: the trusted origin. `null` sends none. */
  origin?: string | null;
  ip?: string;
}

/**
 * A browser on the web app's origin: it keeps the cookies responses set and sends them back, and
 * sends `Origin` with every request as a browser does.
 */
export class Browser {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly target: AccountsApp,
    readonly ip = '192.0.2.10',
  ) {}

  async send(path: string, options: SendOptions = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-real-ip': options.ip ?? this.ip };
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin !== null) headers.Origin = origin;
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (options.json !== undefined) headers['Content-Type'] = 'application/json';
    const res = await this.target.app.request(`${ORIGIN}${path}`, {
      method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
      headers: { ...headers, ...options.headers },
      ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair = ''] = cookie.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === '' || /;\s*Max-Age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  signUp(email: string, password: string, extra: Record<string, unknown> = {}): Promise<Response> {
    return this.send('/api/auth/sign-up/email', { json: { email, password, ...extra } });
  }

  signIn(email: string, password: string): Promise<Response> {
    return this.send('/api/auth/sign-in/email', { json: { email, password } });
  }
}
