import type { Countries, Universal } from '@netnet/contracts';
import { Hono } from 'hono';
import { expect } from 'vitest';
import { originCheck } from '../../src/auth/origin-check';
import { createFx } from '../../src/content/fx';
import { COUNTRIES_KEY } from '../../src/content/publish';
import { createContentStore, type ContentSource } from '../../src/content/store';
import { eventStore } from '../../src/db/analytics';
import type { ContentRef } from '../../src/db/content';
import { ensureProfile } from '../../src/db/profiles';
import { createTrack } from '../../src/events/track';
import { holdingsRoutes } from '../../src/http/holdings';
import type { LedgerDeps } from '../../src/http/ledger-edge';
import { ledgerInit, meRoutes } from '../../src/http/me';
import { prefsRoutes } from '../../src/http/prefs';
import { snapshotRoutes } from '../../src/http/snapshot';
import { tagsRoutes } from '../../src/http/tags';
import { typesRoutes } from '../../src/http/types';
import { valuesRoutes } from '../../src/http/values';
import { baseCurrencyOf } from '../../src/ledger/base-currency';
import { ledgerContent } from '../../src/ledger/content';
import type { AppEnv } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { noStore, requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';
import { FIXED_NOW, type TestDatabase } from '../isolation/harness';
import { COUNTRY_V1, GENERIC_V1, fakeRates, newUserId } from '../ledger/support';
import { captureWaitUntil, type CapturedWaitUntil } from '../support/wait-until';

/**
 * The REST routes over the Ledger, wired as app.ts wires them, over a test database: `withUser` as
 * `netnet_app` on the fixed clock, the real content store over fictional content in memory (an
 * imaginary country "QZ" with pack "qz", and generic), fake exchange rates behind the real
 * `crossRate`, and events written to the test database after the response. The session is the
 * user a test names in a header: how the cookie becomes a user is P1-T11's, tested in
 * test/auth/. Every name and figure is made up (CONVENTIONS §6).
 */

/** The header a test names its signed-in user with. Only this test app reads it. */
const TEST_USER = 'x-test-user';

/** A small country list: one with a pack, two without. */
export const COUNTRIES: Countries = {
  QZ: { currency: 'EUR', pack: 'qz' },
  GB: { currency: 'GBP' },
  US: { currency: 'USD' },
};

/** Published content as the store reads it: each document at version 1. */
function memoryContent(): ContentSource {
  const docs = new Map<string, unknown>([
    ['pack/generic@1', GENERIC_V1],
    ['pack/qz@1', COUNTRY_V1],
    [`countries/${COUNTRIES_KEY}@1`, COUNTRIES],
  ]);
  const refs: ContentRef[] = [...docs.keys()].map((id) => {
    const [kind = '', rest = ''] = id.split('/');
    const [key = '', version = ''] = rest.split('@');
    return { kind, key, version: Number(version) };
  });
  return {
    current: () => Promise.resolve(refs),
    body: (ref) => Promise.resolve(docs.get(`${ref.kind}/${ref.key}@${ref.version}`)),
  };
}

export interface LedgerApp {
  db: TestDatabase;
  app: Hono<AppEnv>;
  deps: LedgerDeps;
  /** What `afterResponse` handed over: events and log lines written after a response. */
  waits: CapturedWaitUntil;
  /** Awaits the work handed over after responses. */
  settle(): Promise<void>;
  /** Puts Vercel's request context back as it was. */
  restore(): void;
}

export function ledgerApp(db: TestDatabase): LedgerApp {
  const store = createContentStore({ source: memoryContent() });
  const fx = createFx(fakeRates());
  const deps: LedgerDeps = {
    profile: (userId) => ensureProfile(db.appDb, userId),
    withUser: db.withUser,
    options: (profile) => ({
      fx,
      content: ledgerContent(store, profile.country),
      timeZone: profile.timeZone,
    }),
    track: createTrack(() => ({ store: eventStore(db.appDb), clock: () => FIXED_NOW })),
    appVersion: () => 'test123',
  };
  const waits = captureWaitUntil();

  const app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    noStore(),
    originCheck(() => ['http://localhost:5173']),
    sessionContext((c) => {
      const userId = c.req.header(TEST_USER);
      return Promise.resolve(userId ? { userId, emailVerified: true } : null);
    }),
  );
  app.route(
    '/api/me',
    meRoutes({
      db: () => db.appDb,
      baseCurrency: (userId) => baseCurrencyOf(db.withUser, userId),
      countries: () => Promise.resolve(COUNTRIES),
      initLedger: ledgerInit(deps.withUser, deps.options),
    }),
  );
  app.route('/api/snapshot', snapshotRoutes(deps));
  app.route('/api/holdings', holdingsRoutes(deps));
  app.route('/api', valuesRoutes(deps));
  app.route('/api/types', typesRoutes(deps));
  app.route('/api/tags', tagsRoutes(deps));
  app.route('/api/prefs', prefsRoutes(deps));
  app.notFound(handleNotFound);
  app.onError(handleError);

  return {
    db,
    app,
    deps,
    waits,
    settle: () => waits.settle(),
    restore: () => waits.restore(),
  };
}

export interface SendOptions {
  /** Sent as JSON; a string is sent as it is. */
  json?: unknown;
  headers?: Record<string, string>;
}

/** A request as `userId` (or nobody, for null). */
export function send(
  target: LedgerApp,
  userId: string | null,
  method: string,
  path: string,
  options: SendOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (userId !== null) headers[TEST_USER] = userId;
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = typeof options.json === 'string' ? options.json : JSON.stringify(options.json);
  }
  return Promise.resolve(
    target.app.request(`http://localhost${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    }),
  );
}

/** A signed-in person's requests. */
export interface Person {
  userId: string;
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  post(path: string, json: unknown): Promise<Response>;
  patch(path: string, json: unknown): Promise<Response>;
  delete(path: string): Promise<Response>;
}

export function person(target: LedgerApp, userId: string): Person {
  return {
    userId,
    get: (path, headers = {}) => send(target, userId, 'GET', path, { headers }),
    post: (path, json) => send(target, userId, 'POST', path, { json }),
    patch: (path, json) => send(target, userId, 'PATCH', path, { json }),
    delete: (path) => send(target, userId, 'DELETE', path),
  };
}

/** The JSON body of `res`, after checking its status. */
export async function json<T = Record<string, unknown>>(res: Response, status = 200): Promise<T> {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
}

/** A new account, with nothing set up yet: `/api/me` needs the account to exist. */
export async function newPerson(target: LedgerApp): Promise<Person> {
  const userId = newUserId();
  await target.db.owner.query(`insert into core.user (id, name, email) values ($1, '', $2)`, [
    userId,
    `${userId.toLowerCase()}@example.com`,
  ]);
  return person(target, userId);
}

/** A new person who has confirmed `country` (QZ, with its pack, unless given): a ledger exists. */
export async function onboarded(target: LedgerApp, country = 'QZ'): Promise<Person> {
  const p = await newPerson(target);
  await json(await p.patch('/api/me', { country }));
  return p;
}

interface SnapshotBody {
  dataVersion: number;
  types: { id: string; universal: Universal; packTypeKey: string | null }[];
  [key: string]: unknown;
}

/** The person's snapshot. */
export async function snapshotOf(p: Person): Promise<SnapshotBody> {
  return json<SnapshotBody>(await p.get('/api/snapshot'));
}

/** The person's plain type for `universal` (the one `init` made), from their snapshot. */
export async function typeIdOf(p: Person, universal: Universal): Promise<string> {
  const { types } = await snapshotOf(p);
  const type = types.find((t) => t.universal === universal && t.packTypeKey === null);
  if (!type) throw new Error(`No ${universal} type`);
  return type.id;
}

/** A well-formed id of `prefix` that nobody has. */
export function unknownId(prefix: string): string {
  return `${prefix}_01K1G4KX00ZZZZZZZZZZZZZZZZ`;
}

/** Writes made through a route: `{result, dataVersion, warnings}`. */
export interface WriteBody<T = Record<string, unknown>> {
  result: T;
  dataVersion: number;
  warnings: { code: string; message: string; path?: string }[];
}

/** The error body of `res`, after checking its status. */
export async function errorOf(
  res: Response,
  status: number,
): Promise<
  { code: string; message: string; fields?: Record<string, string> } & Record<string, unknown>
> {
  return (await json<{ error: never }>(res, status)).error;
}
