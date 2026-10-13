import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_ROLE, bootstrapRoles } from '../../src/db/bootstrap';

/**
 * The `reminder_state` migration (CONVENTIONS §10): applied to an empty database, and to the
 * previous release's schema with fixture users — who are backfilled as if they checked on the
 * migration day, due 30 days out, so nobody gets a surprise reminder on deploy day.
 */

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

interface Journal {
  entries: { tag: string }[];
}

function statements(tag: string): string[] {
  const sql = readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8');
  return sql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

async function freshDatabase(): Promise<{ client: Client; name: string; base: string }> {
  const base = process.env.DATABASE_URL ?? '';
  if (base === '') throw new Error('DATABASE_URL is not set.');
  const name = `netnet_mig_${randomBytes(6).toString('hex')}`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(base);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.href });
  await client.connect();
  await bootstrapRoles(client, { appPassword: randomBytes(24).toString('hex') });
  return { client, name, base };
}

const created: { client: Client; name: string; base: string }[] = [];

afterAll(async () => {
  for (const { client, name, base } of created) {
    await client.end();
    const admin = new Client({ connectionString: base });
    await admin.connect();
    try {
      await admin.query(`drop database if exists ${name} with (force)`);
    } finally {
      await admin.end();
    }
  }
});

async function apply(client: Client, tag: string): Promise<void> {
  for (const statement of statements(tag)) await client.query(statement);
}

describe('0005_reminder_state', () => {
  it('backfills existing users as if they checked on the migration day', async () => {
    const journal = JSON.parse(
      readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8'),
    ) as Journal;
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags.at(-1)).toBe('0005_reminder_state');

    const { client } = await freshDatabase().then((made) => {
      created.push(made);
      return made;
    });
    for (const tag of tags.slice(0, -1)) await apply(client, tag);
    await client.query(
      `insert into core."user" (id, name, email) values
         ('usr_01K1G4KX00AAAAAAAAAAAAAAAA', '', 'migration-a@example.com'),
         ('usr_01K1G4KX00BBBBBBBBBBBBBBBB', '', 'migration-b@example.com')`,
    );
    await apply(client, '0005_reminder_state');

    const { rows } = await client.query<Record<string, unknown>>(
      `select user_id, enabled, email_enabled, last_checked_on::text, next_due_on::text,
         sent_since_check, last_sent_at, last_channel
       from core.reminder_state order by user_id`,
    );
    const expected = await client.query<{ today: string; plus30: string }>(
      `select CURRENT_DATE::text as today, (CURRENT_DATE + 30)::text as plus30`,
    );
    const today = expected.rows[0]?.today;
    const plus30 = expected.rows[0]?.plus30;
    expect(rows).toEqual([
      {
        user_id: 'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
        enabled: true,
        email_enabled: true,
        last_checked_on: today,
        next_due_on: plus30,
        sent_since_check: 0,
        last_sent_at: null,
        last_channel: null,
      },
      {
        user_id: 'usr_01K1G4KX00BBBBBBBBBBBBBBBB',
        enabled: true,
        email_enabled: true,
        last_checked_on: today,
        next_due_on: plus30,
        sent_since_check: 0,
        last_sent_at: null,
        last_channel: null,
      },
    ]);

    // netnet_app reaches the table through 0001's default privileges.
    const grants = await client.query<{ grantee: string; privilege: string }>(
      `select grantee::text, privilege_type as privilege from information_schema.role_table_grants
       where table_schema = 'core' and table_name = 'reminder_state' and grantee = $1`,
      [APP_ROLE],
    );
    expect(grants.rows.map((row) => row.privilege).sort()).toEqual(
      ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].sort(),
    );
  });

  it('applies cleanly to an empty database', async () => {
    const journal = JSON.parse(
      readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8'),
    ) as Journal;
    const tags = journal.entries.map((entry) => entry.tag);
    const { client } = await freshDatabase().then((made) => {
      created.push(made);
      return made;
    });
    for (const tag of tags) await apply(client, tag);
    const { rows } = await client.query(`select count(*)::int as n from core.reminder_state`);
    expect(rows).toEqual([{ n: 0 }]);
  });
});
