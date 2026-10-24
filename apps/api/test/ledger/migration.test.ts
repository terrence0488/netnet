import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { createFx } from '../../src/content/fx';
import { APP_ROLE, bootstrapRoles } from '../../src/db/bootstrap';
import { createDatabase, createPool } from '../../src/db/client';
import { openLedger } from '../../src/ledger/ledger';
import { createWithUser } from '../../src/ledger/with-user';
import { FIXED_NOW } from '../isolation/harness';
import { FakeContent, GENERIC_V1, fakeRates, USER } from './support';

/**
 * The migration that drops undo's link columns (CONVENTIONS §10): applied to an empty database,
 * and to the previous release's schema holding undo entries, as production does (the Founder's and
 * the probe's accounts). Both columns and their foreign keys go; every entry stays, and each reads
 * through the Ledger as the plain change it made, old → new.
 */

const MIGRATION = '0009_drop_audit_undo';
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

interface Made {
  client: Client;
  name: string;
  base: string;
  /** `netnet_app` on this database. */
  appUrl: string;
}

const created: Made[] = [];

async function freshDatabase(): Promise<Made> {
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
  const appPassword = randomBytes(24).toString('hex');
  await bootstrapRoles(client, { appPassword });
  const app = new URL(url.href);
  app.username = APP_ROLE;
  app.password = appPassword;
  const made = { client, name, base, appUrl: app.href };
  created.push(made);
  return made;
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

/** The audit table's columns and constraints, as the catalog has them. */
async function auditShape(client: Client) {
  const columns = await client.query<{ name: string }>(
    `select attname as name from pg_attribute
      where attrelid = 'ledger.audit'::regclass and attnum > 0 and not attisdropped order by attnum`,
  );
  const constraints = await client.query<{ name: string }>(
    `select conname as name from pg_constraint where conrelid = 'ledger.audit'::regclass order by 1`,
  );
  return {
    columns: columns.rows.map((r) => r.name),
    constraints: constraints.rows.map((r) => r.name),
  };
}

const AFTER = {
  columns: [
    'user_id',
    'id',
    'at',
    'actor',
    'client_name',
    'connection_id',
    'batch_id',
    'action',
    'entity',
    'entity_id',
    'before',
    'after',
  ],
  constraints: [
    'audit_actor_check',
    'audit_batch_fk',
    'audit_id_check',
    'audit_state_fk',
    'audit_user_id_id_pk',
  ],
};

const USER_ID = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const CONNECTION = 'con_01K1G4KX00AAAAAAAAAAAAAAAA';
const BATCH = 'bat_01K1G4KX00AAAAAAAAAAAAAAAA';
const AGENT_VALUE = 'aud_01K1G4KX0000000000000000A1';
const UNDO_OF_VALUE = 'aud_01K1G4KX0000000000000000A2';
const UNDO_OF_UNDO = 'aud_01K1G4KX0000000000000000A3';
const WEB_TAG = 'aud_01K1G4KX0000000000000000B1';
const UNDO_OF_TAG = 'aud_01K1G4KX0000000000000000B2';

const value = (amountMinor: number) => ({
  id: 'val_01K1G4KX00AAAAAAAAAAAAAAAA',
  holdingId: 'hld_01K1G4KX00AAAAAAAAAAAAAAAA',
  date: '2026-07-01',
  amountMinor,
  currency: 'EUR',
});
const TAG = { id: 'tag_01K1G4KX00AAAAAAAAAAAAAAAA', name: 'Joint', sort: 0 };

/**
 * Undo entries as the previous release wrote them: an agent's value change, its undo by the person,
 * and the undo of that undo (which left the first live again); and a tag the person added, then
 * undid. Each undo is the inverse change, linked by `undoes`, its target by `undone_by`.
 */
async function seedUndoEntries(client: Client): Promise<void> {
  await client.query(
    `insert into ledger.ledger_state (user_id, base_currency, data_version) values ($1, 'EUR', 5)`,
    [USER_ID],
  );
  await client.query(
    `insert into ledger.batch (user_id, id, connection_id, opened_at, last_write_at)
     values ($1, $2, $3, $4, $4)`,
    [USER_ID, BATCH, CONNECTION, FIXED_NOW],
  );
  const at = (minutes: number) => new Date(FIXED_NOW.getTime() + minutes * 60_000);
  const rows: unknown[][] = [
    [
      AGENT_VALUE,
      at(0),
      'agent',
      'Claude',
      CONNECTION,
      BATCH,
      'update',
      'value',
      value(100_00),
      value(120_00),
    ],
    [
      UNDO_OF_VALUE,
      at(1),
      'user',
      null,
      null,
      null,
      'update',
      'value',
      value(120_00),
      value(100_00),
    ],
    [
      UNDO_OF_UNDO,
      at(2),
      'user',
      null,
      null,
      null,
      'update',
      'value',
      value(100_00),
      value(120_00),
    ],
    [WEB_TAG, at(3), 'user', null, null, null, 'create', 'tag', null, TAG],
    [UNDO_OF_TAG, at(4), 'user', null, null, null, 'delete', 'tag', TAG, null],
  ];
  for (const [
    id,
    when,
    actor,
    clientName,
    connectionId,
    batchId,
    action,
    entity,
    before,
    after,
  ] of rows) {
    await client.query(
      `insert into ledger.audit
         (user_id, id, at, actor, client_name, connection_id, batch_id, action, entity, entity_id,
          before, after)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        USER_ID,
        id,
        when,
        actor,
        clientName,
        connectionId,
        batchId,
        action,
        entity,
        entity === 'tag' ? TAG.id : value(0).id,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
      ],
    );
  }
  // The links, once every row exists (their foreign keys point both ways).
  const link = async (id: string, undoes: string | null, undoneBy: string | null) => {
    await client.query(
      `update ledger.audit set undoes = $3, undone_by = $4 where user_id = $1 and id = $2`,
      [USER_ID, id, undoes, undoneBy],
    );
  };
  await link(AGENT_VALUE, null, null);
  await link(UNDO_OF_VALUE, AGENT_VALUE, UNDO_OF_UNDO);
  await link(UNDO_OF_UNDO, UNDO_OF_VALUE, null);
  await link(WEB_TAG, null, UNDO_OF_TAG);
  await link(UNDO_OF_TAG, WEB_TAG, null);
}

describe(MIGRATION, () => {
  it('drops undo’s columns and keys over a database that holds undo entries', async () => {
    const all = tags();
    expect(all).toContain(MIGRATION);
    const at = all.indexOf(MIGRATION);

    const { client, appUrl } = await freshDatabase();
    for (const tag of all.slice(0, at)) await apply(client, tag);
    await seedUndoEntries(client);
    const linked = await client.query<{ n: number }>(
      `select count(*)::int as n from ledger.audit where undoes is not null or undone_by is not null`,
    );
    expect(linked.rows).toEqual([{ n: 4 }]);

    await apply(client, MIGRATION);
    for (const tag of all.slice(at + 1)) await apply(client, tag);
    expect(await auditShape(client)).toStrictEqual(AFTER);
    const kept = await client.query<{ id: string }>(
      `select id from ledger.audit where user_id = $1 order by at, id`,
      [USER_ID],
    );
    expect(kept.rows.map((r) => r.id)).toStrictEqual([
      AGENT_VALUE,
      UNDO_OF_VALUE,
      UNDO_OF_UNDO,
      WEB_TAG,
      UNDO_OF_TAG,
    ]);

    // As the app reads it: each former undo is the plain change it made, old → new.
    const pool = createPool(appUrl);
    try {
      const db = createDatabase(pool);
      const withUser = createWithUser(() => ({ db, clock: () => FIXED_NOW }));
      const content = new FakeContent([GENERIC_V1]).forCountry(null);
      const options = { fx: createFx(fakeRates()), content, timeZone: 'UTC' };
      const page = await withUser(USER_ID, USER, (tx) =>
        openLedger(tx, options).activity({ limit: 100 }),
      );
      expect(
        page.items.map((e) => ({
          id: e.id,
          actor: e.actor,
          clientName: e.clientName,
          batchId: e.batchId,
          action: e.action,
          summary: e.summary,
          before: e.before,
          after: e.after,
        })),
      ).toStrictEqual([
        {
          id: UNDO_OF_TAG,
          actor: 'user',
          clientName: null,
          batchId: null,
          action: 'delete',
          summary: 'Removed tag "Joint"',
          before: TAG,
          after: null,
        },
        {
          id: WEB_TAG,
          actor: 'user',
          clientName: null,
          batchId: null,
          action: 'create',
          summary: 'Added tag "Joint"',
          before: null,
          after: TAG,
        },
        {
          id: UNDO_OF_UNDO,
          actor: 'user',
          clientName: null,
          batchId: null,
          action: 'update',
          summary: 'Updated the value for 2026-07-01',
          before: value(100_00),
          after: value(120_00),
        },
        {
          id: UNDO_OF_VALUE,
          actor: 'user',
          clientName: null,
          batchId: null,
          action: 'update',
          summary: 'Updated the value for 2026-07-01',
          before: value(120_00),
          after: value(100_00),
        },
        {
          id: AGENT_VALUE,
          actor: 'agent',
          clientName: 'Claude',
          batchId: BATCH,
          action: 'update',
          summary: 'Updated the value for 2026-07-01',
          before: value(100_00),
          after: value(120_00),
        },
      ]);
      for (const entry of page.items) {
        expect(Object.keys(entry)).not.toContain('undoes');
        expect(Object.keys(entry)).not.toContain('undoneBy');
      }
    } finally {
      await pool.end();
    }
  });

  it('applies cleanly to an empty database', async () => {
    const { client } = await freshDatabase();
    for (const tag of tags()) await apply(client, tag);
    expect(await auditShape(client)).toStrictEqual(AFTER);
  });
});
