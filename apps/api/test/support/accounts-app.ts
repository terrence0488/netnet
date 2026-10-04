import type { Countries } from '@netnet/contracts';
import { Hono } from 'hono';
import { createAuth, type Auth } from '../../src/auth/auth';
import { originCheck } from '../../src/auth/origin-check';
import { authRoutes } from '../../src/auth/routes';
import { sessionFromCookie } from '../../src/auth/session';
import { eventStore } from '../../src/db/analytics';
import { accountOf } from '../../src/db/profiles';
import { countHit } from '../../src/db/rate-limits';
import { createTrack } from '../../src/events/track';
import { eventsRoutes } from '../../src/http/events';
import { geoRoutes } from '../../src/http/geo';
import { meRoutes } from '../../src/http/me';
import { baseCurrencyOf } from '../../src/ledger/base-currency';
import type { AppEnv } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { createRateLimit } from '../../src/lib/rate-limit';
import { noStore, requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';
import { captureChannel, type CaptureChannel } from '../../src/notify/email';
import { createNotify } from '../../src/notify/notify';
import { FIXED_NOW, type TestDatabase } from '../isolation/harness';

/**
 * The accounts routes wired as app.ts wires them, over a test database: Better Auth as
 * `netnet_app`, emails captured (never sent), events written to the test database, and the rate
 * limits on a clock the test moves.
 */

/** Where the fictional web app runs. */
export const ORIGIN = 'http://localhost:5173';

/** A test-only secret: 32 bytes of nothing in particular. */
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

/** A small country list: two with a pack, one without. */
export const COUNTRIES: Countries = {
  FR: { currency: 'EUR' },
  MY: { currency: 'MYR', pack: 'my' },
  SG: { currency: 'SGD', pack: 'sg' },
};

export interface AccountsApp {
  app: Hono<AppEnv>;
  auth: Auth;
  emails: CaptureChannel;
  /** The rate limits' clock. */
  clock: { now: Date };
  /** Awaits the work handed to run after responses: emails and events. */
  settle(): Promise<void>;
}

export function accountsApp(db: TestDatabase): AccountsApp {
  const emails = captureChannel();
  const clock = { now: FIXED_NOW };
  const pending: Promise<unknown>[] = [];
  const background = (task: Promise<unknown>) => void pending.push(task);
  const notify = createNotify(() => ({
    recipient: (userId) => accountOf(db.appDb, userId),
    email: emails,
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
  app.route('/api/auth', authRoutes({ auth: () => auth, rateLimit }));
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
  app.notFound(handleNotFound);
  app.onError(handleError);

  return {
    app,
    auth,
    emails,
    clock,
    async settle() {
      while (pending.length > 0) await Promise.allSettled(pending.splice(0));
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
