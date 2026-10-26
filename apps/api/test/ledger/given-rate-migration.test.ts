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
import { FakeContent, GENERIC_V1, fakeRates } from './support';

/**
 * The migration that keeps a given rate as given (architecture §6.6, CONVENTIONS §10): applied to
 * an empty database, and to the previous release's schema holding values with the person's and an
 * agent's rates, as production does. Each such value takes its stored rate as its given rate, into
 * its base currency, by whoever gave it; every other value has none. The previous schema's values
 * are migrated by a role that owns the table without bypassing row-level security, as
 * `netnet_owner` may not, so the backfill cannot pass by reaching no row.
 */

const MIGRATION = '0010_given_rate';
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
const roles: string[] = [];

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
  // A role outlives a database, and owns nothing once the database is gone.
  const base = process.env.DATABASE_URL ?? '';
  if (roles.length === 0 || base === '') return;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  try {
    for (const role of roles) await admin.query(`drop role if exists ${role}`);
  } finally {
    await admin.end();
  }
});

async function apply(client: Client, tag: string): Promise<void> {
  for (const statement of statements(tag)) await client.query(statement);
}

/** The value table's given-rate columns and constraints, as the catalog has them. */
async function valueShape(client: Client) {
  const columns = await client.query<{ name: string; type: string }>(
    `select attname as name, format_type(atttypid, atttypmod) as type from pg_attribute
      where attrelid = 'ledger.value'::regclass and attnum > 0 and not attisdropped
        and attname like 'given_rate%' order by attnum`,
  );
  // Postgres 18 lists each NOT NULL as a constraint (`contype = 'n'`); none of these is one.
  const constraints = await client.query<{ name: string }>(
    `select conname as name from pg_constraint
      where conrelid = 'ledger.value'::regclass and contype <> 'n' and conname like '%given_rate%'
      order by 1`,
  );
  const force = await client.query<{ force: boolean }>(
    `select relforcerowsecurity as force from pg_class where oid = 'ledger.value'::regclass`,
  );
  return {
    columns: columns.rows.map((r) => `${r.name} ${r.type}`),
    constraints: constraints.rows.map((r) => r.name),
    forceRowLevelSecurity: force.rows[0]?.force,
  };
}

const AFTER = {
  columns: ['given_rate numeric', 'given_rate_into character(3)', 'given_rate_by text'],
  constraints: [
    'value_given_rate_all_or_none_check',
    'value_given_rate_by_check',
    'value_given_rate_check',
    'value_given_rate_into_check',
  ],
  forceRowLevelSecurity: true,
};

const USER_A = 'usr_01K1G4KX00AAAAAAAAAAAAAAAA';
const USER_B = 'usr_01K1G4KX00BBBBBBBBBBBBBBBB';
const TYPE = 'typ_01K1G4KX00AAAAAAAAAAAAAAAA';
const DOLLARS = 'hld_01K1G4KX00AAAAAAAAAAAAAAA1';
const EUROS = 'hld_01K1G4KX00AAAAAAAAAAAAAAA2';
const BY_USER = 'val_01K1G4KX00AAAAAAAAAAAAAAA1';
const BY_AGENT = 'val_01K1G4KX00AAAAAAAAAAAAAAA2';
const PUBLISHED = 'val_01K1G4KX00AAAAAAAAAAAAAAA3';
const SAME = 'val_01K1G4KX00AAAAAAAAAAAAAAA4';
const B_BY_USER = 'val_01K1G4KX00BBBBBBBBBBBBBBB1';

interface Row {
  id: string;
  holdingId: string;
  date: string;
  amountMinor: number;
  currency: string;
  baseMinor: number;
  baseCurrency: string;
  fxRate: string;
  fxRateDate: string | null;
  fxSource: string;
  source: string;
  clientName: string | null;
}

/**
 * Values as the previous release wrote them, in two ledgers: in A's (EUR), a dollar value at the
 * person's rate, one at an agent's, one at the published rate, and a euro value; in B's (GBP), a
 * euro value at the person's rate.
 */
async function seedValues(client: Client): Promise<void> {
  // The accounts the previous release's ledgers belonged to: the app's writes now lock the account
  // row (`withUser`), so a ledger without one could not be read or changed afterwards.
  await client.query(
    `insert into core."user" (id, name, email) values
       ($1, '', $2), ($3, '', $4)`,
    [USER_A, `${USER_A.toLowerCase()}@example.com`, USER_B, `${USER_B.toLowerCase()}@example.com`],
  );
  for (const [userId, currency] of [
    [USER_A, 'EUR'],
    [USER_B, 'GBP'],
  ] as const) {
    await client.query(
      `insert into ledger.ledger_state (user_id, base_currency, data_version) values ($1, $2, 3)`,
      [userId, currency],
    );
    await client.query(
      `insert into ledger.user_type (user_id, id, universal) values ($1, $2, 'cash')`,
      [userId, TYPE],
    );
  }
  for (const [userId, id, currency] of [
    [USER_A, DOLLARS, 'USD'],
    [USER_A, EUROS, 'EUR'],
    [USER_B, EUROS, 'EUR'],
  ] as const) {
    await client.query(
      `insert into ledger.holding (user_id, id, name, kind, type_id, currency, access)
       values ($1, $2, 'Savings', 'asset', $3, $4, 'accessible')`,
      [userId, id, TYPE, currency],
    );
  }
  const rows: [string, Row][] = [
    [USER_A, row(BY_USER, DOLLARS, '2026-07-10', 10000, 'USD', 9100, 'EUR', '0.91', 'user')],
    [USER_A, row(BY_AGENT, DOLLARS, '2026-07-11', 20000, 'USD', 18400, 'EUR', '0.92', 'agent')],
    [USER_A, row(PUBLISHED, DOLLARS, '2026-07-12', 30000, 'USD', 24000, 'EUR', '0.8', 'ecb')],
    [USER_A, row(SAME, EUROS, '2026-07-13', 40000, 'EUR', 40000, 'EUR', '1', 'same')],
    [USER_B, row(B_BY_USER, EUROS, '2026-07-14', 50000, 'EUR', 43000, 'GBP', '0.86', 'user')],
  ];
  for (const [userId, v] of rows) {
    await client.query(
      `insert into ledger.value
         (user_id, id, holding_id, date, amount_minor, currency, base_minor, base_currency,
          fx_rate, fx_rate_date, fx_source, source, client_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        v.id,
        v.holdingId,
        v.date,
        v.amountMinor,
        v.currency,
        v.baseMinor,
        v.baseCurrency,
        v.fxRate,
        v.fxRateDate,
        v.fxSource,
        v.source,
        v.clientName,
      ],
    );
  }
}

function row(
  id: string,
  holdingId: string,
  date: string,
  amountMinor: number,
  currency: string,
  baseMinor: number,
  baseCurrency: string,
  fxRate: string,
  fxSource: string,
): Row {
  const agent = fxSource === 'agent';
  return {
    id,
    holdingId,
    date,
    amountMinor,
    currency,
    baseMinor,
    baseCurrency,
    fxRate,
    fxRateDate: fxSource === 'same' ? null : fxSource === 'ecb' ? '2026-07-01' : date,
    fxSource,
    source: agent ? 'agent' : 'web',
    clientName: agent ? 'Fictional agent' : null,
  };
}

describe(MIGRATION, () => {
  it('keeps the person’s and the agent’s rates as given, over values the previous release wrote', async () => {
    const all = tags();
    expect(all).toContain(MIGRATION);
    const at = all.indexOf(MIGRATION);

    const { client, appUrl } = await freshDatabase();
    for (const tag of all.slice(0, at)) await apply(client, tag);
    await seedValues(client);

    // The table's owner, bound by its row-level security as netnet_owner may be.
    const owner = `netnet_mig_owner_${randomBytes(4).toString('hex')}`;
    roles.push(owner);
    await client.query(`create role ${owner} nologin nosuperuser nobypassrls`);
    await client.query(`grant usage on schema ledger to ${owner}`);
    await client.query(`alter table ledger.value owner to ${owner}`);
    await client.query(`set role ${owner}`);
    expect((await client.query('select id from ledger.value')).rows).toStrictEqual([]);
    await apply(client, MIGRATION);
    await client.query('reset role');
    for (const tag of all.slice(at + 1)) await apply(client, tag);

    expect(await valueShape(client)).toStrictEqual(AFTER);
    const given = await client.query<{
      id: string;
      rate: string | null;
      into: string | null;
      by: string | null;
    }>(
      `select id, given_rate as rate, given_rate_into as into, given_rate_by as by
         from ledger.value order by id`,
    );
    expect(given.rows).toStrictEqual([
      { id: BY_USER, rate: '0.91', into: 'EUR', by: 'user' },
      { id: BY_AGENT, rate: '0.92', into: 'EUR', by: 'agent' },
      { id: PUBLISHED, rate: null, into: null, by: null },
      { id: SAME, rate: null, into: null, by: null },
      { id: B_BY_USER, rate: '0.86', into: 'GBP', by: 'user' },
    ]);

    // All three or none.
    const partial = await client
      .query(`update ledger.value set given_rate_by = null where id = $1`, [BY_USER])
      .then(
        () => null,
        (error: { code?: string; constraint?: string }) => [error.code, error.constraint],
      );
    expect(partial).toStrictEqual(['23514', 'value_given_rate_all_or_none_check']);

    // As the app reads them: through another default currency and back, the rates come back
    // exactly as given.
    const pool = createPool(appUrl);
    try {
      const db = createDatabase(pool);
      const withUser = createWithUser(() => ({ db, clock: () => FIXED_NOW }));
      const content = new FakeContent([GENERIC_V1]).forCountry(null);
      const options = { fx: createFx(fakeRates()), content, timeZone: 'UTC' };
      const change = (code: string) =>
        withUser(
          USER_A,
          { kind: 'system' },
          (tx) => openLedger(tx, options).changeBaseCurrency(code),
          { write: true },
        );
      const values = async () =>
        (
          await withUser(USER_A, { kind: 'user' }, (tx) => openLedger(tx, options).exportAll())
        ).values.filter((v) => v.id === BY_USER || v.id === BY_AGENT);

      await change('GBP');
      // 0.91 × EUR-to-GBP (0.75 ÷ 0.8 = 0.9375) = 0.853125, on the value's own date.
      expect((await values())[0]).toMatchObject({
        baseMinor: 8531,
        baseCurrency: 'GBP',
        fxRate: '0.853125',
        fxRateDate: '2026-07-10',
        fxSource: 'user',
        givenRate: '0.91',
        givenRateInto: 'EUR',
      });
      await change('EUR');
      expect(
        (await values()).map((v) => [v.baseMinor, v.fxRate, v.fxRateDate, v.fxSource]),
      ).toStrictEqual([
        [9100, '0.91', '2026-07-10', 'user'],
        [18400, '0.92', '2026-07-11', 'agent'],
      ]);
    } finally {
      await pool.end();
    }
  });

  it('applies cleanly to an empty database', async () => {
    const { client } = await freshDatabase();
    for (const tag of tags()) await apply(client, tag);
    expect(await valueShape(client)).toStrictEqual(AFTER);
  });
});
