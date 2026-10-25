import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setEmailReminders, setRemindersEnabled, touchChecked } from '../../src/db/reminders';
import { FIXED_NOW, createTestDatabase, sqlState, type TestDatabase } from '../isolation/harness';
import { newUserId } from '../ledger/support';
import {
  Browser,
  ORIGIN,
  accountsApp,
  type AccountsApp,
  type SendOptions,
} from '../support/accounts-app';
import { captureLog, type CapturedLog } from '../support/failures';
import { signUpPerson, type Person } from '../support/oauth-client';

/**
 * Checking NetNet on the web (PRD J12, architecture §7.10): signing up starts the clock, and any
 * session-authenticated `/api/*` request restarts it after the response — while requests without
 * a session, a sign-out and the reminder's own signed links never do. Reading the session after
 * the response writes nothing to the response and refreshes nothing. The MCP half (`tools/call`
 * touches, `tools/list` does not) is test/mcp/touch-checked.test.ts.
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

describe('the session read after the response', () => {
  let log: CapturedLog;

  beforeEach(() => {
    log = captureLog();
  });

  afterEach(() => vi.restoreAllMocks());

  /** The failure lines written: anything a sign-out or a touch should never log. */
  function failures(): Record<string, unknown>[] {
    return log.lines().filter((line) => /_failed$|^auth_error$/.test(String(line.event)));
  }

  /**
   * `path` sent as `browser`, its body read as a server streams it to the browser, and then the
   * work after the response awaited: the order in which production runs them.
   */
  async function answered(browser: Browser, path: string, options: SendOptions = {}) {
    const res = await browser.send(path, options);
    await res.arrayBuffer();
    await web.settle();
    return res;
  }

  async function sessionOf(userId: string): Promise<{ expires_at: Date; updated_at: Date }> {
    const { rows } = await db.owner.query<{ expires_at: Date; updated_at: Date }>(
      'select expires_at, updated_at from core.session where user_id = $1',
      [userId],
    );
    expect(rows).toHaveLength(1);
    return rows[0] ?? { expires_at: new Date(0), updated_at: new Date(0) };
  }

  it('signs in and out with no failure, and the sign-out is not a check', async () => {
    const person = await newPerson();
    const browser = new Browser(web);
    const signedIn = await answered(browser, '/api/auth/sign-in/email', {
      json: { email: person.email, password: 'correct horse' },
    });
    expect(signedIn.status).toBe(200);
    await ageClock(person.userId);
    const before = await stateOf(person.userId);

    const res = await answered(browser, '/api/auth/sign-out', { method: 'POST', json: {} });
    expect(res.status).toBe(200);
    expect(browser.cookies.size).toBe(0);
    expect(failures()).toStrictEqual([]);
    // The session is gone once the sign-out has answered: there is nobody to count (§7.10).
    expect(await stateOf(person.userId)).toEqual(before);
  });

  it('restarts the clock after a route that does not read the session', async () => {
    const person = await newPerson();
    await ageClock(person.userId);
    const res = await answered(person.browser, '/api/geo');
    expect(res.status).toBe(200);
    expect(await stateOf(person.userId)).toMatchObject({
      last_checked_on: '2026-08-01',
      next_due_on: '2026-08-31',
      sent_since_check: 0,
    });
    expect(failures()).toStrictEqual([]);
  });

  it('leaves a session due its refresh to the next foreground read, and writes nothing late', async () => {
    const person = await newPerson();
    await ageClock(person.userId);
    // A day of the session's 30 has gone by: the next read that may refresh it moves its end.
    await db.owner.query(
      `update core.session set expires_at = now() + interval '29 days' - interval '1 minute',
         updated_at = now() - interval '1 day' - interval '1 minute' where user_id = $1`,
      [person.userId],
    );
    const due = await sessionOf(person.userId);

    // /api/geo never reads the session, so only the touch does, after the response.
    const geo = await answered(person.browser, '/api/geo');
    expect(geo.status).toBe(200);
    expect(geo.headers.getSetCookie()).toStrictEqual([]);
    expect(await sessionOf(person.userId)).toStrictEqual(due);
    expect(failures()).toStrictEqual([]);
    // The touch still counted the request.
    expect(await stateOf(person.userId)).toMatchObject({ last_checked_on: '2026-08-01' });

    // The next request that reads the session in the foreground refreshes it, cookie and all.
    const me = await answered(person.browser, '/api/me');
    expect(me.status).toBe(200);
    const refreshed = await sessionOf(person.userId);
    expect(refreshed.expires_at.getTime()).toBeGreaterThan(due.expires_at.getTime());
    expect(me.headers.getSetCookie()).toStrictEqual([
      expect.stringMatching(/^__Secure-netnet\.session_token=.+;\s*Max-Age=2592000/),
    ]);
    expect(failures()).toStrictEqual([]);
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
