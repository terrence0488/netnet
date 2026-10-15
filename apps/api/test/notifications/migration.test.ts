import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_ROLE, bootstrapRoles } from '../../src/db/bootstrap';

/**
 * The `notification_endpoint` migration (CONVENTIONS §10): applied to an empty database, and to
 * the previous release's schema with fixture users — who get no rows, since no device has push on
 * yet. `netnet_app` reaches the table through 0001's default privileges.
 */

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

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

describe('0006_notification_endpoints', () => {
  it('adds the table over the previous release’s schema, with no rows and the grants', async () => {
    const all = tags();
    expect(all).toContain('0006_notification_endpoints');
    const before = all.slice(0, all.indexOf('0006_notification_endpoints'));

    const { client } = await freshDatabase().then((made) => {
      created.push(made);
      return made;
    });
    for (const tag of before) await apply(client, tag);
    await client.query(
      `insert into core."user" (id, name, email) values
         ('usr_01K1G4KX00AAAAAAAAAAAAAAAA', '', 'migration-a@example.com')`,
    );
    await apply(client, '0006_notification_endpoints');

    const { rows } = await client.query(
      `select count(*)::int as n from core.notification_endpoint`,
    );
    expect(rows).toEqual([{ n: 0 }]);
    // One live row per URL: a revoked row may keep a URL a live row took.
    await client.query(
      `insert into core.notification_endpoint
         (id, user_id, endpoint, keys, platform, device_label, revoked_at)
       values ('nep_01K1G4KX00AAAAAAAAAAAAAAAA', 'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
         'https://push.example.net/push/x', '{"p256dh":"a","auth":"b"}', 'android',
         'Android · Chrome', now())`,
    );
    await client.query(
      `insert into core.notification_endpoint
         (id, user_id, endpoint, keys, platform, device_label)
       values ('nep_01K1G4KX00BBBBBBBBBBBBBBBB', 'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
         'https://push.example.net/push/x', '{"p256dh":"a","auth":"b"}', 'android',
         'Android · Chrome')`,
    );
    await expect(
      client.query(
        `insert into core.notification_endpoint
           (id, user_id, endpoint, keys, platform, device_label)
         values ('nep_01K1G4KX00CCCCCCCCCCCCCCCC', 'usr_01K1G4KX00AAAAAAAAAAAAAAAA',
           'https://push.example.net/push/x', '{"p256dh":"a","auth":"b"}', 'android',
           'Android · Chrome')`,
      ),
    ).rejects.toThrow(/duplicate key/);

    const grants = await client.query<{ grantee: string; privilege: string }>(
      `select grantee::text, privilege_type as privilege from information_schema.role_table_grants
       where table_schema = 'core' and table_name = 'notification_endpoint' and grantee = $1`,
      [APP_ROLE],
    );
    expect(grants.rows.map((row) => row.privilege).sort()).toEqual(
      ['DELETE', 'INSERT', 'SELECT', 'UPDATE'].sort(),
    );
  });

  it('applies cleanly to an empty database', async () => {
    const { client } = await freshDatabase().then((made) => {
      created.push(made);
      return made;
    });
    for (const tag of tags()) await apply(client, tag);
    const { rows } = await client.query(
      `select count(*)::int as n from core.notification_endpoint`,
    );
    expect(rows).toEqual([{ n: 0 }]);
  });
});
