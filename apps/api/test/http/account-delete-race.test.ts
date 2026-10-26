import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { originCheck } from '../../src/auth/origin-check';
import { createFx } from '../../src/content/fx';
import { eventStore } from '../../src/db/analytics';
import { ensureProfile, type Profile } from '../../src/db/profiles';
import { createTrack } from '../../src/events/track';
import { accountRoutes } from '../../src/http/account';
import {
  ledgerCountryChange,
  ledgerCurrencyChange,
  ledgerInit,
  meRoutes,
  type MeDeps,
} from '../../src/http/me';
import { baseCurrencyOf } from '../../src/ledger/base-currency';
import type { LedgerOptions } from '../../src/ledger/ledger';
import type { WithUser } from '../../src/ledger/with-user';
import type { AppEnv } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { noStore, requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';
import {
  FIXED_NOW,
  createTestDatabase,
  ensureAccount,
  type TestDatabase,
} from '../isolation/harness';
import { COUNTRY_V1, FakeContent, GENERIC_V1, fakeRates, newUserId } from '../ledger/support';
import { rowsCarrying } from '../support/erasure';
import { COUNTRIES } from './support';

/**
 * `DELETE /api/account` against a first confirmation that is already in flight (P4-T19, the
 * security review's L-2): the confirmation records the country, then the deletion runs to its
 * commit, then the confirmation goes on to make the ledger. It must wait for the deletion and
 * fail, not commit a `ledger` row for an id the deletion has erased. The seam is the deletion's
 * `withUser` callback: `beforeCommit()` runs inside its transaction, after its deletes and before
 * its commit. All data is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let app: Hono<AppEnv>;

/** Runs inside the deletion's transaction once it has deleted everything, before it commits. */
let beforeCommit: () => Promise<void> = () => Promise.resolve();
/** Runs in the first confirmation just before it makes the ledger; set by `holdTheInit()`. */
let beforeInit: (() => Promise<void>) | undefined;

const content = new FakeContent([GENERIC_V1, COUNTRY_V1]);
const fx = createFx(fakeRates());

function options(profile: Profile): LedgerOptions {
  return {
    fx,
    content: content.forCountry(profile.country === 'QZ' ? 'qz' : null),
    timeZone: profile.timeZone,
  };
}

const TEST_USER = 'x-test-user';

beforeAll(async () => {
  db = await createTestDatabase();
  const meDeps: MeDeps = {
    db: () => db.appDb,
    baseCurrency: (userId) => baseCurrencyOf(db.withUser, userId),
    countries: () => Promise.resolve(COUNTRIES),
    initLedger: async (userId, profile, baseCurrency) => {
      if (beforeInit) await beforeInit();
      return ledgerInit(db.withUser, options)(userId, profile, baseCurrency);
    },
    changeLedgerCountry: ledgerCountryChange(db.withUser, options),
    changeLedgerCurrency: ledgerCurrencyChange(db.withUser, options),
  };
  /** The deletion's own `withUser`, with the seam inside its transaction. */
  const deletingWithUser: WithUser = (userId, actor, fn, opts) =>
    db.withUser(
      userId,
      actor,
      async (tx) => {
        const result = await fn(tx);
        await beforeCommit();
        return result;
      },
      opts,
    );
  app = new Hono<AppEnv>();
  app.use(
    '*',
    requestContext(),
    noStore(),
    originCheck(() => ['http://localhost:5173']),
    sessionContext((c) => {
      const userId = c.req.header(TEST_USER);
      if (!userId) return Promise.resolve(null);
      return Promise.resolve({ userId, emailVerified: true, signedInAt: new Date() });
    }),
  );
  app.route('/api/me', meRoutes(meDeps));
  app.route(
    '/api/account',
    accountRoutes({
      db: () => db.appDb,
      withUser: deletingWithUser,
      profile: (userId) => ensureProfile(db.appDb, userId),
      options,
      track: createTrack(() => ({ store: eventStore(db.appDb), clock: () => FIXED_NOW })),
      appVersion: () => 'test123',
      clock: () => new Date(),
    }),
  );
  app.notFound(handleNotFound);
  app.onError(handleError);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

afterEach(() => {
  beforeCommit = () => Promise.resolve();
  beforeInit = undefined;
});

/** A request as `userId`; no `Origin`, so it is not checked as a browser's. */
function send(userId: string, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { [TEST_USER]: userId };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return Promise.resolve(
    app.request(`http://localhost${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

/** Holds the deletion just before its commit: `atCommit` once it is there, `commit()` lets it go. */
function holdTheDeletion(): { atCommit: Promise<void>; commit: () => void } {
  let reached!: () => void;
  const atCommit = new Promise<void>((resolve) => (reached = resolve));
  let commit!: () => void;
  const released = new Promise<void>((resolve) => (commit = resolve));
  beforeCommit = () => {
    reached();
    return released;
  };
  return { atCommit, commit };
}

/** Holds the first confirmation just before its ledger write: `atInit` once it is there. */
function holdTheInit(): { atInit: Promise<void>; release: () => void } {
  let reached!: () => void;
  const atInit = new Promise<void>((resolve) => (reached = resolve));
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  beforeInit = () => {
    reached();
    return released;
  };
  return { atInit, release };
}

describe('a first confirmation racing the deletion', () => {
  it('leaves no ledger row for the erased id', async () => {
    const userId = newUserId();
    await ensureAccount(db, userId);

    const init = holdTheInit();
    const deletion = holdTheDeletion();

    // The first confirmation records the country, then stops just before it makes the ledger.
    const confirming = send(userId, 'PATCH', '/api/me', { country: 'QZ' });
    await init.atInit;

    // The deletion runs to its commit: the account row (its profile with it) and the ledger rows
    // are deleted, uncommitted, and the transaction holds its locks.
    const deleting = send(userId, 'DELETE', '/api/account');
    await deletion.atCommit;

    // The confirmation goes on. It must wait for the deletion and then fail, not commit a ledger
    // the deletion has already swept.
    init.release();
    deletion.commit();

    expect((await deleting).status).toBe(200);
    expect((await confirming).status).toBe(401);
    const { rows } = await db.owner.query<{ n: number }>(
      'select count(*)::int as n from ledger.ledger_state where user_id = $1',
      [userId],
    );
    expect(rows[0]?.n).toBe(0);
    // The erasure search finds no trace of the id in `core` or `ledger`.
    expect(await rowsCarrying(db.owner, userId)).toStrictEqual({});
  });
});
