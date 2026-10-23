import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFx } from '../../src/content/fx';
import { eventStore } from '../../src/db/analytics';
import { insertAttempt } from '../../src/db/connection-attempts';
import { saveEndpoint } from '../../src/db/endpoints';
import { ensureProfile } from '../../src/db/profiles';
import {
  agentConnection,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from '../../src/db/schema';
import { createTrack } from '../../src/events/track';
import { accountRoutes } from '../../src/http/account';
import { seedLedger } from '../../src/ledger/seed';
import type { WithUser } from '../../src/ledger/with-user';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { FakeContent, GENERIC_V1, fakeRates } from '../ledger/support';
import { accountsApp, Browser, type AccountsApp } from '../support/accounts-app';
import { rowsCarrying } from '../support/erasure';

/**
 * `DELETE /api/account` through a real cookie session (PRD J10): a fresh sign-in deletes, an old
 * one is refused until the person signs in again, and afterwards the session is dead. Here the app
 * runs the work after each response, as app.ts does, so `touchChecked` runs too: once everything
 * has settled, no row anywhere carries the erased id, even when a request races the deletion. The
 * route's own steps are `test/http/account.test.ts`. All data is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let target: AccountsApp;
/** Runs inside the deletion's transaction once it has deleted everything, before it commits. */
let beforeCommit: () => Promise<void> = () => Promise.resolve();

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
  // The deletion route over this app's database; destroying an empty ledger needs no content.
  const content = new FakeContent([GENERIC_V1]);
  const withUser: WithUser = (userId, actor, fn, opts) =>
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
  target.app.route(
    '/api/account',
    accountRoutes({
      db: () => db.appDb,
      withUser,
      profile: (userId) => ensureProfile(db.appDb, userId),
      options: () => ({
        fx: createFx(fakeRates()),
        content: content.forCountry(null),
        timeZone: 'UTC',
      }),
      track: createTrack(() => ({ store: eventStore(db.appDb), clock: () => target.clock.now })),
      appVersion: () => 'test123',
      clock: () => target.clock.now,
    }),
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

afterEach(() => {
  beforeCommit = () => Promise.resolve();
  vi.restoreAllMocks();
});

let n = 0;

async function signedUp(): Promise<{ browser: Browser; email: string }> {
  n += 1;
  const browser = new Browser(target);
  const email = `deleted-${n}@example.com`;
  const res = await browser.signUp(email, 'correct horse battery');
  expect(res.status).toBe(200);
  return { browser, email };
}

async function userIds(email: string): Promise<string[]> {
  const { rows } = await db.owner.query<{ id: string }>(
    `select id from core.user where email = $1`,
    [email],
  );
  return rows.map((r) => r.id);
}

describe('DELETE /api/account through a cookie session', () => {
  it('deletes on a fresh sign-in, and the session dies with the account', async () => {
    const { browser, email } = await signedUp();
    const deleted = await browser.send('/api/account', { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toStrictEqual({ erasedWithinDays: 30 });
    expect(await userIds(email)).toHaveLength(0);

    const me = await browser.send('/api/me');
    expect(me.status).toBe(401);
    expect(await me.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('refuses an old sign-in until the person signs in again', async () => {
    const { browser, email } = await signedUp();
    // Eleven minutes before the suite's clock: the session signed in too long ago.
    await db.owner.query(`update core.session set created_at = $1 where user_id = $2`, [
      new Date(target.clock.now.getTime() - 11 * 60_000),
      (await userIds(email))[0],
    ]);
    const refused = await browser.send('/api/account', { method: 'DELETE' });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: { code: 'REAUTH_REQUIRED' } });
    expect(await userIds(email)).toHaveLength(1);

    // Signing in again makes a fresh session, and the deletion goes through.
    const signIn = await browser.signIn(email, 'correct horse battery');
    expect(signIn.status).toBe(200);
    const deleted = await browser.send('/api/account', { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await userIds(email)).toHaveLength(0);
  });
});

/**
 * Everything an account can hold, for `userId`: a ledger with a row in every `ledger` table, an
 * active and a revoked agent connection with their grants, a push device, a connection attempt and
 * a password-reset token. Sign-up made the profile, the reminder state, the session and the
 * sign-in account.
 */
async function stock(userId: string, tag: string): Promise<void> {
  const app = db.appDb;
  const connection = `con_01K1G4KX00DE1${tag}`;
  await app.insert(agentConnection).values([
    {
      id: connection,
      userId,
      clientId: `https://agent.example/${connection}.json`,
      clientName: 'Fictional agent',
      registration: 'cimd',
      client: 'other',
      createdAt: FIXED_NOW,
    },
    {
      id: `con_01K1G4KX00DE0${tag}`,
      userId,
      clientId: `https://agent.example/old-${tag}.json`,
      clientName: 'Old agent',
      registration: 'dcr',
      client: 'claude',
      createdAt: FIXED_NOW,
      revokedAt: FIXED_NOW,
    },
  ]);
  const clientId = `https://client.example/${tag}.json`;
  await app.insert(oauthClient).values({
    id: `oc_${tag}`,
    clientId,
    redirectUris: ['https://client.example/callback'],
  });
  await app.insert(oauthRefreshToken).values({
    id: `ort_${tag}`,
    token: `refresh-${tag}`,
    clientId,
    userId,
    referenceId: connection,
    expiresAt: new Date('2026-11-01T00:00:00Z'),
    createdAt: FIXED_NOW,
    scopes: ['ledger.read', 'ledger.write'],
  });
  await app.insert(oauthAccessToken).values({
    id: `oat_${tag}`,
    token: `access-${tag}`,
    clientId,
    userId,
    referenceId: connection,
    expiresAt: new Date('2026-08-01T11:00:00Z'),
    createdAt: FIXED_NOW,
    scopes: ['ledger.read'],
  });
  await app.insert(oauthConsent).values({
    id: `ocn_${tag}`,
    clientId,
    userId,
    referenceId: connection,
    scopes: ['ledger.read', 'ledger.write'],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  });
  await db.owner.query(
    `insert into core.verification (id, identifier, value, expires_at)
     values ($1, 'reset-password:tok', $2, $3)`,
    [`ver_${tag}`, userId, new Date('2026-08-01T11:00:00Z')],
  );
  await saveEndpoint(
    app,
    userId,
    {
      endpoint: `https://push.example/${tag}`,
      keys: { p256dh: 'p256dh', auth: 'auth' },
      platform: 'desktop',
      deviceLabel: 'Computer · Browser',
    },
    FIXED_NOW,
  );
  await insertAttempt(app, {
    id: `att_01K1G4KX00DE1${tag}`,
    userId,
    client: 'claude',
    entry: 'agent',
    platform: 'computer',
    at: FIXED_NOW,
  });
  await seedLedger(db.withUser, { userId, baseCurrency: 'USD', connectionId: connection });
  // Checked long ago, so the next check writes the reminder row.
  await db.owner.query(
    `update core.reminder_state set last_checked_on = '2026-06-01', next_due_on = '2026-07-01'
     where user_id = $1`,
    [userId],
  );
}

/** Where a stocked account's id is written down: every place the erasure must reach. */
const STOCKED = [
  'core.account.user_id',
  'core.agent_connection.user_id',
  'core.connection_attempt.user_id',
  'core.notification_endpoint.user_id',
  'core.oauth_access_token.user_id',
  'core.oauth_consent.user_id',
  'core.oauth_refresh_token.user_id',
  'core.profile.user_id',
  'core.reminder_state.user_id',
  'core.session.user_id',
  'core.user.id',
  'core.verification.value',
  'ledger.audit.user_id',
  'ledger.batch.user_id',
  'ledger.holding.user_id',
  'ledger.holding_tag.user_id',
  'ledger.ledger_state.user_id',
  'ledger.prefs.user_id',
  'ledger.tag.user_id',
  'ledger.user_type.user_id',
  'ledger.value.user_id',
];

/** The log lines written while `fn` ran, parsed. */
function logLines(): () => Record<string, unknown>[] {
  const lines: string[] = [];
  for (const method of ['log', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => {
      if (typeof line === 'string') lines.push(line);
    });
  }
  return () =>
    lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

/** Resolves when some connection to the test database is waiting on a lock. */
async function someoneWaitsOnALock(): Promise<void> {
  await vi.waitFor(
    async () => {
      const { rows } = await db.owner.query<{ n: number }>(
        `select count(*)::int as n from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock'`,
      );
      expect(rows[0]?.n).toBeGreaterThan(0);
    },
    { timeout: 10_000, interval: 20 },
  );
}

describe('the erasure, after the work after the response', () => {
  it('leaves no row in core, ledger or identity that carries the erased id', async () => {
    const { browser, email } = await signedUp();
    const [userId = ''] = await userIds(email);
    await stock(userId, String(n).padStart(13, '0'));
    const before = await rowsCarrying(db.owner, userId);
    // Every table the erasure must reach holds the id, so the check below is not vacuous.
    expect(Object.keys(before)).toEqual(expect.arrayContaining(STOCKED));
    const lines = logLines();

    const deleted = await browser.send('/api/account', { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    // The deletion request's own `touchChecked` runs after its response: after the deletion.
    await target.settle();

    expect(await rowsCarrying(db.owner, userId)).toStrictEqual({});
    expect(lines().filter((line) => line.event === 'after_response_failed')).toStrictEqual([]);
  });

  it('re-creates nothing for a request that races the deletion', async () => {
    const { browser, email } = await signedUp();
    const [userId = ''] = await userIds(email);
    await stock(userId, String(n).padStart(13, '0'));
    const lines = logLines();

    // The deletion runs up to its commit, and waits there.
    let reached!: () => void;
    const atCommit = new Promise<void>((resolve) => (reached = resolve));
    let commit!: () => void;
    const released = new Promise<void>((resolve) => (commit = resolve));
    beforeCommit = () => {
      reached();
      return released;
    };
    const deleting = browser.send('/api/account', { method: 'DELETE' });
    await atCommit;

    // Meanwhile another request of the same session: the account is still there for it, and its
    // `touchChecked` runs into the deletion's locks and waits for them.
    const me = await browser.send('/api/me');
    expect(me.status).toBe(200);
    await someoneWaitsOnALock();

    commit();
    expect((await deleting).status).toBe(200);
    await target.settle();

    expect(await rowsCarrying(db.owner, userId)).toStrictEqual({});
    expect(lines().filter((line) => line.event === 'after_response_failed')).toStrictEqual([]);
  });
});

describe('the core schema', () => {
  it('ties every table keyed by a user id to the user row, so the deletion reaches it', async () => {
    // Read from the catalog, so a table added later is held to it too.
    const { rows } = await db.owner.query<{ table: string; rule: string | null }>(
      `select c.relname as table,
              (select k.confdeltype::text from pg_constraint k
                where k.conrelid = c.oid and k.contype = 'f'
                  and k.confrelid = 'core."user"'::regclass
                  and k.conkey = array[a.attnum]) as rule
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
        where n.nspname = 'core' and c.relkind in ('r', 'p')
        order by 1`,
    );
    // Cascade, or set null for a client a person registered, which other accounts share.
    const expected = (table: string) => (table === 'oauth_client' ? 'n' : 'c');
    expect(rows.map((r) => r.table)).toEqual(
      expect.arrayContaining(['profile', 'reminder_state', 'session', 'account']),
    );
    expect(rows.filter((r) => r.rule !== expected(r.table))).toStrictEqual([]);
  });
});
