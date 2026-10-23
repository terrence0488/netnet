import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setEmailReminders, setRemindersEnabled, touchChecked } from '../../src/db/reminders';
import { FIXED_NOW, createTestDatabase, sqlState, type TestDatabase } from '../isolation/harness';
import { newUserId } from '../ledger/support';
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

  it('makes a missing row for an account, from its time zone, and no profile', async () => {
    const person = await newPerson('Pacific/Kiritimati');
    await db.owner.query(`delete from core.reminder_state where user_id = $1`, [person.userId]);
    // 10:00 UTC is midnight the next day in Kiritimati (UTC+14).
    await touchChecked(db.appDb, person.userId, FIXED_NOW);
    expect(await stateOf(person.userId)).toMatchObject({
      last_checked_on: '2026-08-02',
      next_due_on: '2026-09-01',
    });

    const noProfile = await newPerson();
    await db.owner.query(`delete from core.reminder_state where user_id = $1`, [noProfile.userId]);
    await db.owner.query(`delete from core.profile where user_id = $1`, [noProfile.userId]);
    await touchChecked(db.appDb, noProfile.userId, FIXED_NOW);
    expect(await stateOf(noProfile.userId)).toMatchObject({ last_checked_on: '2026-08-01' });
    const { rows } = await db.owner.query(`select 1 from core.profile where user_id = $1`, [
      noProfile.userId,
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe('an id no account holds, such as one just deleted (PRD J10)', () => {
  it('gets no reminder row or profile from a check or either switch', async () => {
    const gone = newUserId();
    await touchChecked(db.appDb, gone, FIXED_NOW);
    await setRemindersEnabled(db.appDb, gone, false);
    await setEmailReminders(db.appDb, gone, false);
    const { rows } = await db.owner.query<{ n: number }>(
      `select (select count(*) from core.reminder_state where user_id = $1)
            + (select count(*) from core.profile where user_id = $1) as n`,
      [gone],
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it('is refused such a row by the database, whoever writes it', async () => {
    const gone = newUserId();
    expect(
      await sqlState(
        db.owner.query(`insert into core.reminder_state (user_id) values ($1)`, [gone]),
      ),
    ).toBe('23503');
    expect(
      await sqlState(db.owner.query(`insert into core.profile (user_id) values ($1)`, [gone])),
    ).toBe('23503');
  });

  it('still lets the switches make a missing row for an account', async () => {
    const person = await newPerson();
    await db.owner.query(`delete from core.reminder_state where user_id = $1`, [person.userId]);
    await setRemindersEnabled(db.appDb, person.userId, false);
    await setEmailReminders(db.appDb, person.userId, false);
    const { rows } = await db.owner.query(
      `select enabled, email_enabled from core.reminder_state where user_id = $1`,
      [person.userId],
    );
    expect(rows).toStrictEqual([{ enabled: false, email_enabled: false }]);
  });
});
