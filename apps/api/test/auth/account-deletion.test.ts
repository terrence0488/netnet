import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFx } from '../../src/content/fx';
import { eventStore } from '../../src/db/analytics';
import { ensureProfile } from '../../src/db/profiles';
import { createTrack } from '../../src/events/track';
import { accountRoutes } from '../../src/http/account';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { FakeContent, GENERIC_V1, fakeRates } from '../ledger/support';
import { accountsApp, Browser, type AccountsApp } from '../support/accounts-app';

/**
 * `DELETE /api/account` through a real cookie session (PRD J10): a fresh sign-in deletes, an old
 * one is refused until the person signs in again, and afterwards the session is dead. The
 * deletion's own completeness is `test/http/account.test.ts`; this is the session's age as Better
 * Auth keeps it. All data is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let target: AccountsApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
  // The deletion route over this app's database; destroying an empty ledger needs no content.
  const content = new FakeContent([GENERIC_V1]);
  target.app.route(
    '/api/account',
    accountRoutes({
      db: () => db.appDb,
      withUser: db.withUser,
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
