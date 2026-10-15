import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/lib/ids';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { CRON_SECRET, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { AgentClient, signUpPerson, type Person } from '../support/oauth-client';

/**
 * A reminder run (PRD J12, architecture §7.10, CONVENTIONS §9): due at day 30, 60 and 90 with no
 * check and never a fourth; any check restarts the clock; daytime only in every time zone; never
 * two in a month even with overlapping runs; the switches and the verified address honoured; the
 * 60-a-day email cap releases for the next run; the security-email retry rides along; and the
 * right `reminder_sent` and `security_email_sent` events fire.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

const MINUTE = 60_000;
const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db, {
    guideName: (client) => Promise.resolve(client === 'claude' ? 'Claude' : 'ChatGPT'),
  });
}, 60_000);

beforeEach(() => {
  target.clock.now = FIXED_NOW;
  target.emailDown.value = false;
});

afterAll(async () => {
  await db?.close();
});

function newPerson(options: { verified?: boolean; timeZone?: string } = {}): Promise<Person> {
  serial += 1;
  return signUpPerson(target, db, `reminder-person-${serial}@example.com`, options);
}

function later(ms: number): void {
  target.clock.now = new Date(target.clock.now.getTime() + ms);
}

async function cron(): Promise<Response> {
  const res = await target.app.request(`${ORIGIN}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  await target.settle();
  return res;
}

async function result(res: Response): Promise<Record<string, unknown>> {
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

async function stateOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    `select enabled, email_enabled, last_checked_on::text, next_due_on::text, sent_since_check,
       last_sent_at, last_channel, last_opened_at
     from core.reminder_state where user_id = $1`,
    [userId],
  );
  return rows[0];
}

/** Makes `person` due (or not): the clock as the run would find it after days away. */
async function setClock(
  userId: string,
  clock: {
    lastCheckedOn?: string;
    nextDueOn?: string;
    sentSinceCheck?: number;
    lastSentAt?: Date | null;
    lastChannel?: string | null;
    enabled?: boolean;
    emailEnabled?: boolean;
  },
): Promise<void> {
  await db.owner.query(
    `update core.reminder_state set
       last_checked_on = coalesce($2::date, last_checked_on),
       next_due_on = coalesce($3::date, next_due_on),
       sent_since_check = coalesce($4, sent_since_check),
       last_sent_at = coalesce($5::timestamptz, last_sent_at),
       last_channel = coalesce($6, last_channel),
       enabled = coalesce($7, enabled),
       email_enabled = coalesce($8, email_enabled)
     where user_id = $1`,
    [
      userId,
      clock.lastCheckedOn ?? null,
      clock.nextDueOn ?? null,
      clock.sentSinceCheck ?? null,
      clock.lastSentAt === undefined ? null : (clock.lastSentAt?.toISOString() ?? null),
      clock.lastChannel ?? null,
      clock.enabled ?? null,
      clock.emailEnabled ?? null,
    ],
  );
}

async function events(userId: string, name?: string) {
  await target.settle();
  const { rows } = await db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 ${name ? 'and name = $2' : ''}
      order by id`,
    name ? [userId, name] : [userId],
  );
  return rows;
}

function remindersTo(person: Person) {
  return target.emails.captured.filter(
    (e) => e.to === person.email && e.rendered.subject === 'Your net worth is due for an update.',
  );
}

describe('a reminder run', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await target.app.request(`${ORIGIN}/api/cron/reminders`)).status).toBe(401);
    const wrong = await target.app.request(`${ORIGIN}/api/cron/reminders`, {
      headers: { Authorization: 'Bearer wrong' },
    });
    expect(wrong.status).toBe(401);
  });

  it('sends at day 30, then 60 and 90, and never a fourth until a check', async () => {
    const person = await newPerson();
    // A month away: the clock the run finds on the due day.
    await setClock(person.userId, { lastCheckedOn: '2026-07-02', nextDueOn: '2026-08-01' });
    expect(await result(await cron())).toMatchObject({
      reminders: { push: 0, email: 1, released: 0 },
    });
    expect(remindersTo(person)).toHaveLength(1);
    expect(await stateOf(person.userId)).toMatchObject({
      next_due_on: '2026-08-31',
      sent_since_check: 1,
      last_channel: 'email',
    });
    expect(await events(person.userId, 'reminder_sent')).toEqual([
      { name: 'reminder_sent', props: { channel: 'email' } },
    ]);

    // Still away at day 60 and 90: one more each.
    await setClock(person.userId, { nextDueOn: '2026-08-31' });
    later(30 * 24 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({ reminders: { email: 1 } });
    await setClock(person.userId, { nextDueOn: '2026-09-30' });
    later(30 * 24 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({ reminders: { email: 1 } });
    expect(await stateOf(person.userId)).toMatchObject({ sent_since_check: 3 });
    expect(remindersTo(person)).toHaveLength(3);

    // Day 120: silent, until they check.
    await setClock(person.userId, { nextDueOn: '2026-10-30' });
    later(30 * 24 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({
      reminders: { push: 0, email: 0, released: 0 },
    });
    expect(remindersTo(person)).toHaveLength(3);
    expect(await events(person.userId, 'reminder_sent')).toHaveLength(3);
  });

  it('sends only in the daytime, 08:00–21:00, in every time zone', async () => {
    const sg = await newPerson({ timeZone: 'Asia/Singapore' });
    const london = await newPerson({ timeZone: 'Europe/London' });
    const york = await newPerson({ timeZone: 'America/New_York' });
    const auckland = await newPerson({ timeZone: 'Pacific/Auckland' });
    // At 10:00 UTC: Singapore 18:00 and London 11:00 are awake; New York 06:00 and Auckland
    // 22:00 are not. London's reminder is days overdue, which changes nothing.
    await setClock(sg.userId, { nextDueOn: '2026-08-01' });
    await setClock(london.userId, { nextDueOn: '2026-07-28' });
    await setClock(york.userId, { nextDueOn: '2026-08-01' });
    await setClock(auckland.userId, { nextDueOn: '2026-08-01' });
    expect(await result(await cron())).toMatchObject({ reminders: { email: 2 } });
    expect(remindersTo(sg)).toHaveLength(1);
    expect(remindersTo(london)).toHaveLength(1);
    expect(remindersTo(york)).toHaveLength(0);
    expect(remindersTo(auckland)).toHaveLength(0);
    // The sleepers keep their claim for a daytime run: still due, nothing counted.
    expect(await stateOf(york.userId)).toMatchObject({
      next_due_on: '2026-08-01',
      sent_since_check: 0,
    });
    expect(await stateOf(auckland.userId)).toMatchObject({ sent_since_check: 0 });
    // They have served their purpose; later runs must not hear from them.
    await setClock(york.userId, { enabled: false });
    await setClock(auckland.userId, { enabled: false });
  });

  it('treats 08:00 and 20:59 as day, 07:59 and 21:00 as night', async () => {
    const sydney = await newPerson({ timeZone: 'Australia/Sydney' });
    const noronha = await newPerson({ timeZone: 'America/Noronha' });
    const noumea = await newPerson({ timeZone: 'Pacific/Noumea' });
    const paulo = await newPerson({ timeZone: 'America/Sao_Paulo' });
    // At 10:00 UTC in August: Sydney 20:00 and Noronha 08:00 are in, Noumea 21:00 and São
    // Paulo 07:00 are out.
    for (const person of [sydney, noronha, noumea, paulo]) {
      await setClock(person.userId, { nextDueOn: '2026-08-01' });
    }
    expect(await result(await cron())).toMatchObject({ reminders: { email: 2 } });
    expect(remindersTo(sydney)).toHaveLength(1);
    expect(remindersTo(noronha)).toHaveLength(1);
    expect(remindersTo(noumea)).toHaveLength(0);
    expect(remindersTo(paulo)).toHaveLength(0);
    await setClock(noumea.userId, { enabled: false });
    await setClock(paulo.userId, { enabled: false });
  });

  it('never sends two in a month, even when runs overlap', async () => {
    const person = await newPerson();
    await setClock(person.userId, { nextDueOn: '2026-08-01' });
    const [first, second] = await Promise.all([cron(), cron()]);
    await target.settle();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const sent =
      Number(((await first.json()) as { reminders: { email: number } }).reminders.email) +
      Number(((await second.json()) as { reminders: { email: number } }).reminders.email);
    expect(sent).toBe(1);
    expect(remindersTo(person)).toHaveLength(1);
    expect(await stateOf(person.userId)).toMatchObject({ sent_since_check: 1 });

    // The next day's run finds nothing due for them.
    later(24 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({ reminders: { email: 0 } });
    expect(remindersTo(person)).toHaveLength(1);
  });

  it('honours Reminders off, Email reminders off and unverified addresses', async () => {
    const off = await newPerson();
    const emailOff = await newPerson();
    const unverified = await newPerson({ verified: false });
    await setClock(off.userId, { nextDueOn: '2026-08-01', enabled: false });
    await setClock(emailOff.userId, { nextDueOn: '2026-08-01', emailEnabled: false });
    await setClock(unverified.userId, { nextDueOn: '2026-08-01' });
    expect(await result(await cron())).toMatchObject({
      reminders: { push: 0, email: 0, released: 0 },
    });
    expect(remindersTo(off)).toHaveLength(0);
    expect(remindersTo(emailOff)).toHaveLength(0);
    expect(remindersTo(unverified)).toHaveLength(0);
    for (const person of [off, emailOff, unverified]) {
      expect(await stateOf(person.userId)).toMatchObject({ sent_since_check: 0 });
      expect(await events(person.userId, 'reminder_sent')).toEqual([]);
    }
  });

  it('stops reminder emails at 60 a UTC day, and releases the rest for the next daytime run', async () => {
    // A day of its own, so neither this test's seeds nor other tests' sends count together.
    later(24 * 60 * MINUTE);
    // 59 reminder emails already out today, from fictional people made by SQL.
    const sentAt = target.clock.now;
    for (let n = 0; n < 59; n += 1) {
      const userId = newId('usr');
      await db.owner.query(
        `insert into core."user" (id, name, email, email_verified) values ($1, '', $2, true)`,
        [userId, `cap-seed-${serial}-${n}@example.com`],
      );
      await db.owner.query(`insert into core.profile (user_id, time_zone) values ($1, 'UTC')`, [
        userId,
      ]);
      await db.owner.query(
        `insert into core.reminder_state (user_id, last_sent_at, last_channel)
         values ($1, $2, 'email')`,
        [userId, sentAt.toISOString()],
      );
    }
    const first = await newPerson();
    const second = await newPerson();
    await setClock(first.userId, { nextDueOn: '2026-08-01' });
    await setClock(second.userId, { nextDueOn: '2026-08-01' });

    // The sixtieth goes; the sixty-first is released, still due with nothing counted.
    expect(await result(await cron())).toMatchObject({
      reminders: { email: 1, released: 1 },
    });
    const mailed = remindersTo(first).length === 1 ? first : second;
    const waiting = mailed === first ? second : first;
    expect(remindersTo(mailed)).toHaveLength(1);
    expect(remindersTo(waiting)).toHaveLength(0);
    expect(await stateOf(waiting.userId)).toMatchObject({
      next_due_on: '2026-08-02',
      sent_since_check: 0,
    });
    expect(await events(waiting.userId, 'reminder_sent')).toEqual([]);

    // After the UTC day turns, the first daytime run sends it.
    later(15 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({ reminders: { email: 1 } });
    expect(remindersTo(waiting)).toHaveLength(1);
  });

  it('releases the claim when nothing could be delivered, and sends on the next run', async () => {
    const person = await newPerson();
    await setClock(person.userId, { nextDueOn: '2026-08-01' });
    target.emailDown.value = true;
    expect(await result(await cron())).toMatchObject({
      reminders: { email: 0, released: 1 },
    });
    expect(remindersTo(person)).toHaveLength(0);
    expect(await stateOf(person.userId)).toMatchObject({
      next_due_on: '2026-08-01',
      sent_since_check: 0,
    });
    expect(await events(person.userId, 'reminder_sent')).toEqual([]);

    target.emailDown.value = false;
    later(2 * 60 * MINUTE);
    expect(await result(await cron())).toMatchObject({ reminders: { email: 1 } });
    expect(remindersTo(person)).toHaveLength(1);
  });

  it('names the connected agent used most recently, and only when its name can be shown', async () => {
    const named = await newPerson();
    const rude = await newPerson();
    const alone = await newPerson();
    const at = (minutes: number) => new Date(FIXED_NOW.getTime() - minutes * MINUTE).toISOString();
    await db.owner.query(
      `insert into core.agent_connection
         (id, user_id, client_id, client_name, registration, client, created_at, last_used_at,
          security_email_sent_at)
       values
         ($1, $2, 'https://claude.ai/x', 'Claude', 'cimd', 'claude', $3, $4, $3),
         ($5, $2, 'https://agent.example/y', 'My agent 2.0', 'cimd', 'other', $3, $6, $3)`,
      [newId('con'), named.userId, at(60), at(10), newId('con'), at(50)],
    );
    await db.owner.query(
      `insert into core.agent_connection
         (id, user_id, client_id, client_name, registration, client, created_at, last_used_at,
          security_email_sent_at)
       values ($1, $2, 'dcr-client', 'Codex; rm -rf ~', 'dcr', 'other', $3, $3, $3)`,
      [newId('con'), rude.userId, at(60)],
    );
    for (const person of [named, rude, alone]) {
      await setClock(person.userId, { nextDueOn: '2026-08-01' });
    }
    expect(await result(await cron())).toMatchObject({ reminders: { email: 3 } });
    // Claude was used most recently, so it is Claude the reminder names — the guide's name.
    expect(remindersTo(named)[0]?.rendered.text).toContain('Just ask Claude.');
    expect(remindersTo(rude)[0]?.rendered.text).not.toContain('Just ask');
    expect(remindersTo(alone)[0]?.rendered.text).not.toContain('Just ask');
  });

  it('names another agent when its registered name is short and plain', async () => {
    const person = await newPerson();
    await db.owner.query(
      `insert into core.agent_connection
         (id, user_id, client_id, client_name, registration, client, created_at, last_used_at,
          security_email_sent_at)
       values ($1, $2, 'https://agent.example/z', 'My agent 2.0', 'cimd', 'other', $3, $3, $3)`,
      [newId('con'), person.userId, FIXED_NOW.toISOString()],
    );
    await setClock(person.userId, { nextDueOn: '2026-08-01' });
    expect(await result(await cron())).toMatchObject({ reminders: { email: 1 } });
    expect(remindersTo(person)[0]?.rendered.text).toContain('Just ask My agent 2.0.');
  });

  it('retries the security emails Resend has not accepted, and sets security_email_sent_at', async () => {
    const person = await newPerson();
    target.emailDown.value = true;
    await AgentClient.cimd(target, CLAUDE, 'Claude').connect(person.browser);
    await target.settle();
    const before = await db.owner.query(
      'select security_email_sent_at from core.agent_connection where user_id = $1',
      [person.userId],
    );
    expect(before.rows).toMatchObject([{ security_email_sent_at: null }]);

    // Younger than 10 minutes: not yet.
    later(9 * MINUTE);
    expect(await result(await cron())).toMatchObject({
      securityEmails: { sent: 0, failed: 0 },
    });

    // Resend still down: the run says it failed.
    later(2 * MINUTE);
    const down = await cron();
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({
      securityEmails: { sent: 0, failed: 1 },
    });

    target.emailDown.value = false;
    later(24 * 60 * MINUTE);
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ securityEmails: { sent: 1 } });
    const after = await db.owner.query<{ security_email_sent_at: Date | null }>(
      'select security_email_sent_at from core.agent_connection where user_id = $1',
      [person.userId],
    );
    expect(after.rows[0]?.security_email_sent_at).toEqual(target.clock.now);
    expect(await events(person.userId, 'security_email_sent')).toEqual([
      { name: 'security_email_sent', props: { client: 'claude' } },
    ]);
  });
});
