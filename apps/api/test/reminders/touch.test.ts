import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * Checking NetNet on the web (PRD J12, architecture §7.10): signing up starts the clock, and any
 * session-authenticated `/api/*` request restarts it after the response — while requests without
 * a session and the reminder's own signed links never do. The MCP half (`tools/call` touches,
 * `tools/list` does not) is test/mcp/touch-checked.test.ts.
 */
let db: TestDatabase;
let web: AccountsApp;
let serial = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  web = accountsApp(db);
}, 60_000);

beforeEach(() => {
  web.clock.now = FIXED_NOW;
});

afterAll(async () => {
  await db?.close();
});

function newPerson(timeZone = 'Asia/Singapore'): Promise<Person> {
  serial += 1;
  return signUpPerson(web, db, `check-person-${serial}@example.com`, { timeZone });
}

async function stateOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select last_checked_on::text, next_due_on::text, sent_since_check
     from core.reminder_state where user_id = $1`,
    [userId],
  );
  return rows[0];
}

async function ageClock(userId: string): Promise<void> {
  await db.owner.query(
    `update core.reminder_state
     set last_checked_on = '2026-06-01', next_due_on = '2026-07-01', sent_since_check = 2
     where user_id = $1`,
    [userId],
  );
}

describe('touchChecked', () => {
  it('starts the clock on sign-up, due in 30 days', async () => {
    const person = await newPerson();
    // 10:00 UTC is 18:00 in Singapore: the signup day there.
    expect(await stateOf(person.userId)).toMatchObject({
      last_checked_on: '2026-08-01',
      next_due_on: '2026-08-31',
      sent_since_check: 0,
    });
    const utc = await newPerson('UTC');
    expect(await stateOf(utc.userId)).toMatchObject({
      last_checked_on: '2026-08-01',
      next_due_on: '2026-08-31',
    });
  });

  it('restarts the clock after any session-authenticated /api/* request', async () => {
    const person = await newPerson();
    await ageClock(person.userId);
    const res = await person.browser.send('/api/me');
    expect(res.status).toBe(200);
    await web.settle();
    expect(await stateOf(person.userId)).toMatchObject({
      last_checked_on: '2026-08-01',
      next_due_on: '2026-08-31',
      sent_since_check: 0,
    });
  });

  it('ignores requests without a session, and the signed links even with one', async () => {
    const person = await newPerson();
    await ageClock(person.userId);
    const before = await stateOf(person.userId);
    // No session: a public route answers, and the clock stands still.
    const geo = await web.app.request(`${ORIGIN}/api/geo`, {
      headers: { Origin: ORIGIN, 'x-vercel-ip-country': 'SG' },
    });
    expect(geo.status).toBe(200);
    // A session, but a signed link: the exclusion in the middleware holds.
    await person.browser.send('/api/reminders/opened', { json: { token: 'r1.nope.nope' } });
    await web.settle();
    expect(await stateOf(person.userId)).toEqual(before);
  });
});
