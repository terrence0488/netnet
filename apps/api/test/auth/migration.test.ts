import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/db/bootstrap';

/**
 * The user foreign keys' migration (CONVENTIONS §10): applied to an empty database, and to the
 * previous release's schema with a fixture account plus the rows earlier releases left for ids no
 * account holds — a profile and reminder state made again after a deletion, connections kept
 * revoked — which it deletes, keeping every row of the account that exists. Afterwards the
 * database refuses such a row. All data is fictional (CONVENTIONS §6).
 */

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const TAG = '0008_user_foreign_keys';

const KEPT = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const ERASED = 'usr_01K1G4KX00EEEEEEEEEEEEEEEE';

/** The tables the migration ties to the user row. */
const TABLES = [
  'agent_connection',
  'connection_attempt',
  'notification_endpoint',
  'profile',
  'reminder_state',
];

interface Journal {
  entries: { tag: string }[];
}

function tags(): string[] {
  const journal = JSON.parse(
    readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8'),
  ) as Journal;
  return journal.entries.map((entry) => entry.tag);
}

function statements(tag: string): string[] {
  const sql = readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8');
  return sql
    .split('--> statement-breakpoint')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

const created: { client: Client; name: string; base: string }[] = [];

async function freshDatabase(): Promise<Client> {
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
  created.push({ client, name, base });
  await bootstrapRoles(client, { appPassword: randomBytes(24).toString('hex') });
  return client;
}

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

/** One row in each of `TABLES` for `userId`; `n` keeps the ids apart. */
async function rowsFor(client: Client, userId: string, n: string): Promise<void> {
  await client.query(`insert into core.profile (user_id) values ($1)`, [userId]);
  await client.query(
    `insert into core.reminder_state (user_id, last_checked_on, next_due_on)
     values ($1, '2026-08-01', '2026-08-31')`,
    [userId],
  );
  await client.query(
    `insert into core.agent_connection
       (id, user_id, client_id, client_name, registration, client, revoked_at)
     values ($1, $2, 'https://agent.example/client.json', 'Fictional agent', 'cimd', 'other',
       now())`,
    [`con_01K1G4KX00${n.repeat(16)}`, userId],
  );
  await client.query(
    `insert into core.connection_attempt (id, user_id, client, entry, platform)
     values ($1, $2, 'claude', 'agent', 'computer')`,
    [`att_01K1G4KX00${n.repeat(16)}`, userId],
  );
  await client.query(
    `insert into core.notification_endpoint (id, user_id, endpoint, keys, platform, device_label)
     values ($1, $2, $3, '{"p256dh":"a","auth":"b"}', 'desktop', 'Computer · Browser')`,
    [`nep_01K1G4KX00${n.repeat(16)}`, userId, `https://push.example/${n}`],
  );
}

async function counts(client: Client, userId: string): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  for (const table of TABLES) {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from core.${table} where user_id = $1`,
      [userId],
    );
    found[table] = rows[0]?.n ?? 0;
  }
  return found;
}

const each = (n: number) => Object.fromEntries(TABLES.map((table) => [table, n]));

describe(TAG, () => {
  it('deletes the rows of ids no account holds, then refuses them', async () => {
    const all = tags();
    expect(all).toContain(TAG);
    const client = await freshDatabase();
    for (const tag of all.slice(0, all.indexOf(TAG))) await apply(client, tag);
    await client.query(
      `insert into core."user" (id, name, email) values ($1, '', 'migration-a@example.com')`,
      [KEPT],
    );
    await rowsFor(client, KEPT, 'A');
    await rowsFor(client, ERASED, 'E');

    await apply(client, TAG);

    expect(await counts(client, KEPT)).toStrictEqual(each(1));
    expect(await counts(client, ERASED)).toStrictEqual(each(0));
    await expect(rowsFor(client, ERASED, 'F')).rejects.toThrow(/foreign key/);
    // Deleting the account deletes its rows with it.
    await client.query(`delete from core."user" where id = $1`, [KEPT]);
    expect(await counts(client, KEPT)).toStrictEqual(each(0));
  });

  it('applies cleanly to an empty database', async () => {
    const client = await freshDatabase();
    for (const tag of tags()) await apply(client, tag);
    const { rows } = await client.query<{ table: string }>(
      `select c.conrelid::regclass::text as table from pg_constraint c
        where c.contype = 'f' and c.confrelid = 'core."user"'::regclass and c.confdeltype = 'c'
          and c.conrelid::regclass::text = any($1)
        order by 1`,
      [TABLES.map((table) => `core.${table}`)],
    );
    expect(rows.map((r) => r.table)).toStrictEqual(TABLES.map((table) => `core.${table}`));
  });
});
