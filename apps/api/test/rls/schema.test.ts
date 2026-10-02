import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, ledgerTables, type TestDatabase } from '../isolation/harness';
import { ledgerViolations } from './catalog';

/**
 * CONVENTIONS §10: every `ledger` table has `user_id` in its primary key, composite foreign keys,
 * ENABLE and FORCE ROW LEVEL SECURITY, and the one policy. Read from the catalog of a database the
 * migrations built, so a table added later is checked without touching this file.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('the ledger schema', () => {
  it('has every table in architecture §6.3', async () => {
    expect(await ledgerTables(db)).toEqual(
      expect.arrayContaining([
        'ledger_state',
        'user_type',
        'tag',
        'holding',
        'holding_tag',
        'value',
        'prefs',
        'audit',
        'batch',
      ]),
    );
  });

  it('follows every rule, in every table', async () => {
    expect(await ledgerViolations(db.owner)).toEqual([]);
  });

  it('would fail the build for a table added later that breaks any rule', async () => {
    const client = await db.owner.connect();
    try {
      await client.query('begin');
      await client.query(`create table ledger.rogue_plain (id text primary key, user_id text)`);
      await client.query(
        `create table ledger.rogue_half (
           user_id text not null references ledger.ledger_state (user_id) on delete cascade,
           id text not null,
           name text not null,
           profile_id text references core.profile (user_id),
           primary key (user_id, id))`,
      );
      await client.query(`create unique index rogue_half_name_key on ledger.rogue_half (name)`);
      await client.query(`alter table ledger.rogue_half enable row level security`);
      await client.query(
        `create policy user_isolation on ledger.rogue_half
           using (user_id = current_setting('app.user_id', true))
           with check (user_id = current_setting('app.user_id', true))`,
      );
      await client.query(`create policy everyone on ledger.rogue_half using (true)`);
      await client.query(`create view ledger.rogue_view as select * from ledger.holding`);
      await client.query(
        `create function ledger.rogue_fn() returns int language sql security definer as 'select 1'`,
      );

      expect(await ledgerViolations(client)).toEqual(
        [
          'rogue_fn: a SECURITY DEFINER function, which runs as its owner',
          'rogue_half: foreign key rogue_half_profile_id_fkey does not pair user_id with user_id',
          'rogue_half: foreign key rogue_half_profile_id_fkey points outside ledger, at core.profile',
          'rogue_half: policies are not exactly user_isolation (found everyone, user_isolation)',
          'rogue_half: row-level security is not forced',
          'rogue_half: unique index rogue_half_name_key does not include user_id',
          'rogue_plain: no user_id foreign key to ledger_state with on delete cascade',
          'rogue_plain: policies are not exactly user_isolation (found none)',
          'rogue_plain: row-level security is not enabled',
          'rogue_plain: row-level security is not forced',
          'rogue_plain: unique index rogue_plain_pkey does not include user_id',
          'rogue_plain: user_id is not in the primary key',
          'rogue_plain: user_id is not text not null',
          'rogue_view: a relation of kind v, which the policies do not cover',
        ].sort(),
      );
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
