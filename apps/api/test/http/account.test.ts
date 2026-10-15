import { ERASED_WITHIN_DAYS } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isConnectionActive } from '../../src/db/agent-connections';
import { insertEvent } from '../../src/db/analytics';
import { insertAttempt } from '../../src/db/connection-attempts';
import { saveEndpoint } from '../../src/db/endpoints';
import { claimDueReminders, createReminderState } from '../../src/db/reminders';
import {
  agentConnection,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from '../../src/db/schema';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  aged,
  errorOf,
  json,
  ledgerApp,
  newPerson,
  onboarded,
  send,
  snapshotOf,
  type LedgerApp,
  type Person,
} from './support';

/**
 * `DELETE /api/account` (architecture §7.2, §8, PRD J10): connections revoked, ledger rows,
 * identity, sessions, OAuth grants, endpoints and reminder state deleted, events re-keyed, and
 * `account_deleted` — and no `push_disabled` — fired. Without a sign-in from the last 10 minutes
 * it refuses. All data is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let target: LedgerApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

let n = 0;

/** A person with a ledger, a connection, grants, a device, reminder state and events. */
async function stockedPerson(): Promise<{ p: Person; connection: string }> {
  n += 1;
  const tag = String(n).padStart(13, '0');
  const p = await onboarded(target);
  await json(await p.patch('/api/me', { segment: 'accumulating' }));
  const userId = p.userId;
  const app = db.appDb;
  const connection = `con_01K1G4KX00DE1${tag}`;
  await app.insert(agentConnection).values({
    id: connection,
    userId,
    clientId: `https://agent.example/${connection}.json`,
    clientName: 'Fictional agent',
    registration: 'cimd',
    client: 'other',
    createdAt: FIXED_NOW,
  });
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
  await app.insert(agentConnection).values({
    id: `con_01K1G4KX00DE0${tag}`,
    userId,
    clientId: `https://agent.example/old-${tag}.json`,
    clientName: 'Old agent',
    registration: 'dcr',
    client: 'claude',
    createdAt: FIXED_NOW,
    revokedAt: FIXED_NOW,
  });
  // A session and a sign-in account, as Better Auth keeps them.
  await db.owner.query(
    `insert into core.session (id, expires_at, token, created_at, updated_at, user_id)
     values ($1, $2, $3, $4, $4, $5)`,
    [`ses_${tag}`, new Date('2026-08-31T00:00:00Z'), `session-${tag}`, FIXED_NOW, userId],
  );
  await db.owner.query(
    `insert into core.account (id, account_id, provider_id, user_id, password, updated_at)
     values ($1, $2, 'credential', $3, 'hashed', $4)`,
    [`acc_${tag}`, `${userId}@example.com`, userId, FIXED_NOW],
  );
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
  await createReminderState(app, userId, '2026-08-01');
  await insertAttempt(app, {
    id: `att_01K1G4KX00DE1${tag}`,
    userId,
    client: 'claude',
    entry: 'agent',
    platform: 'computer',
    at: FIXED_NOW,
  });
  await insertEvent(app, {
    name: 'value_recorded',
    at: FIXED_NOW,
    userId,
    segment: 'accumulating',
    props: { source: 'web' },
    appVersion: 'test123',
  });
  return { p, connection };
}

/** How many rows of `userId` each account table holds, as the owner sees them. */
async function coreCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const queries: Record<string, string> = {
    user: `select count(*)::int as n from core.user where id = $1`,
    profile: `select count(*)::int as n from core.profile where user_id = $1`,
    session: `select count(*)::int as n from core.session where user_id = $1`,
    account: `select count(*)::int as n from core.account where user_id = $1`,
    connection: `select count(*)::int as n from core.agent_connection where user_id = $1`,
    active_connection: `select count(*)::int as n from core.agent_connection
      where user_id = $1 and revoked_at is null`,
    attempt: `select count(*)::int as n from core.connection_attempt where user_id = $1`,
    endpoint: `select count(*)::int as n from core.notification_endpoint where user_id = $1`,
    reminder: `select count(*)::int as n from core.reminder_state where user_id = $1`,
    refresh_token: `select count(*)::int as n from core.oauth_refresh_token where user_id = $1`,
    access_token: `select count(*)::int as n from core.oauth_access_token where user_id = $1`,
    consent: `select count(*)::int as n from core.oauth_consent where user_id = $1`,
    verification: `select count(*)::int as n from core.verification where value = $1`,
    ledger_state: `select count(*)::int as n from ledger.ledger_state where user_id = $1`,
    ledger_rows: `select ((select count(*) from ledger.user_type where user_id = $1)
      + (select count(*) from ledger.tag where user_id = $1)
      + (select count(*) from ledger.holding where user_id = $1)
      + (select count(*) from ledger.holding_tag where user_id = $1)
      + (select count(*) from ledger.batch where user_id = $1)
      + (select count(*) from ledger.value where user_id = $1)
      + (select count(*) from ledger.prefs where user_id = $1)
      + (select count(*) from ledger.audit where user_id = $1))::int as n`,
    events: `select count(*)::int as n from analytics.event where user_id = $1`,
  };
  for (const [key, text] of Object.entries(queries)) {
    const { rows } = await db.owner.query<{ n: number }>(text, [userId]);
    counts[key] = rows[0]?.n ?? 0;
  }
  return counts;
}

describe('DELETE /api/account', () => {
  it('needs a session, and is never cached', async () => {
    const res = await send(target, null, 'DELETE', '/api/account');
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('refuses without a sign-in from the last 10 minutes, deleting nothing', async () => {
    const { p } = await stockedPerson();
    const before = await coreCounts(p.userId);
    expect(before.user).toBe(1);

    const error = await errorOf(await aged(p, 11).delete('/api/account'), 401);
    expect(error.code).toBe('REAUTH_REQUIRED');

    expect(await coreCounts(p.userId)).toStrictEqual(before);
    // Nine minutes back still counts as recent.
    const res = await aged(p, 9).delete('/api/account');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await json<{ erasedWithinDays: number }>(res)).toStrictEqual({ erasedWithinDays: 30 });
    expect(ERASED_WITHIN_DAYS).toBe(30);
  });

  it('erases the account: ledger, identity, sessions, grants, endpoints, reminder state', async () => {
    const { p, connection } = await stockedPerson();
    const userId = p.userId;
    const before = await coreCounts(userId);
    expect(before).toMatchObject({
      user: 1,
      profile: 1,
      session: 1,
      account: 1,
      connection: 2,
      active_connection: 1,
      attempt: 1,
      endpoint: 1,
      reminder: 1,
      refresh_token: 1,
      access_token: 1,
      consent: 1,
      verification: 1,
      ledger_state: 1,
      events: 1,
    });
    expect(before.ledger_rows).toBeGreaterThan(0);
    const { rows: mine } = await db.owner.query<{ id: number }>(
      `select id from analytics.event where user_id = $1`,
      [userId],
    );
    expect(mine).toHaveLength(1);

    const res = await p.delete('/api/account');
    expect(await json<{ erasedWithinDays: number }>(res)).toStrictEqual({ erasedWithinDays: 30 });

    // Revoked, not deleted: the next agent call is rejected, and the rows say so.
    expect(await coreCounts(userId)).toMatchObject({
      user: 0,
      profile: 0,
      session: 0,
      account: 0,
      connection: 2,
      active_connection: 0,
      attempt: 0,
      endpoint: 0,
      reminder: 0,
      refresh_token: 0,
      access_token: 0,
      consent: 0,
      verification: 0,
      ledger_state: 0,
      ledger_rows: 0,
      events: 0,
    });
    expect(await isConnectionActive(db.appDb, userId, connection)).toBe(false);

    // The events still count, under a random id no account holds — including `account_deleted`.
    const { rows: rekeyed } = await db.owner.query<{ user_id: string }>(
      `select user_id from analytics.event where id = $1`,
      [mine[0]!.id],
    );
    const randomId = rekeyed[0]!.user_id;
    expect(randomId).toMatch(/^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(randomId).not.toBe(userId);
    const { rows: holders } = await db.owner.query(`select id from core.user where id = $1`, [
      randomId,
    ]);
    expect(holders).toHaveLength(0);
    const { rows: deleted } = await db.owner.query<{ user_id: string; segment: string }>(
      `select user_id, segment from analytics.event
       where name = 'account_deleted' order by id desc limit 1`,
    );
    expect(deleted).toStrictEqual([{ user_id: randomId, segment: 'accumulating' }]);
    const { rows: push } = await db.owner.query(
      `select id from analytics.event where name = 'push_disabled'`,
    );
    expect(push).toHaveLength(0);

    // Nothing is readable afterwards: the profile and the ledger are gone with the account.
    await errorOf(await p.get('/api/me'), 401);
    await errorOf(await p.get('/api/snapshot'), 404);
  });

  it('stops every reminder at once: the run never claims the deleted account', async () => {
    const survivor = await stockedPerson();
    const gone = await stockedPerson();
    // Both due and awake: past-due, daytime in UTC, a device to send to.
    for (const { p } of [survivor, gone]) {
      await db.owner.query(
        `update core.reminder_state set next_due_on = '2026-07-01' where user_id = $1`,
        [p.userId],
      );
    }
    await json(await gone.p.delete('/api/account'));

    const claimed = await claimDueReminders(db.appDb, FIXED_NOW);
    expect(claimed.map((c) => c.userId)).toStrictEqual([survivor.p.userId]);
  });

  it('deletes an account with no ledger', async () => {
    const p = await newPerson(target);
    const res = await p.delete('/api/account');
    expect(await json<{ erasedWithinDays: number }>(res)).toStrictEqual({ erasedWithinDays: 30 });
    expect(await coreCounts(p.userId)).toMatchObject({ user: 0, profile: 0 });
  });

  it('leaves the other account exactly as it was', async () => {
    const other = await stockedPerson();
    const gone = await stockedPerson();
    const before = await coreCounts(other.p.userId);
    const snapshot = await snapshotOf(other.p);

    await json(await gone.p.delete('/api/account'));

    expect(await coreCounts(other.p.userId)).toStrictEqual(before);
    expect(await snapshotOf(other.p)).toStrictEqual(snapshot);
  });
});
