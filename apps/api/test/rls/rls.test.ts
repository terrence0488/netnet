import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MARKER_A,
  USER_A,
  USER_B,
  asApp,
  createTestDatabase,
  ledgerTables,
  seedUsers,
  sqlState,
  type TestDatabase,
} from '../isolation/harness';

/**
 * CONVENTIONS §9, the row-level security row: raw SQL as `netnet_app`, no `WHERE`, against every
 * `ledger` table the catalog lists. Users A and B each have rows in every table.
 */
let db: TestDatabase;
let tables: string[];

beforeAll(async () => {
  db = await createTestDatabase();
  await seedUsers(db);
  tables = await ledgerTables(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** One of `userId`'s rows in `table`, read as the owner, as JSON. */
async function rowOf(table: string, userId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.owner.query<{ row: Record<string, unknown> }>(
    `select to_jsonb(t) as row from ledger.${table} t where user_id = $1 limit 1`,
    [userId],
  );
  const [first] = rows;
  if (!first) throw new Error(`The fixture has no ${table} row for ${userId}`);
  return first.row;
}

describe('the fixture', () => {
  it('has rows for both users in every ledger table, so every check below bites', async () => {
    for (const table of tables) {
      const { rows } = await db.owner.query<{ user_id: string; n: string }>(
        `select user_id, count(*) as n from ledger.${table} group by 1 order by 1`,
      );
      expect({ table, users: rows.map((r) => r.user_id) }).toEqual({
        table,
        users: [USER_A, USER_B],
      });
    }
  });
});

describe('as netnet_app with user B set', () => {
  it('a raw SELECT * on every ledger table returns B’s rows and none of A’s', async () => {
    await asApp(db, USER_B, async (client) => {
      for (const table of tables) {
        const { rows } = await client.query<Record<string, unknown>>(
          `select * from ledger.${table}`,
        );
        const text = JSON.stringify(rows);
        expect({
          table,
          seesOwn: rows.length > 0,
          users: [...new Set(rows.map((r) => r.user_id))],
        }).toEqual({
          table,
          seesOwn: true,
          users: [USER_B],
        });
        expect(text).not.toContain(USER_A);
        expect(text).not.toContain(MARKER_A);
      }
    });
  });

  it('a WHERE naming A’s user id or A’s rows finds nothing', async () => {
    await asApp(db, USER_B, async (client) => {
      for (const table of tables) {
        const { rowCount } = await client.query(
          `select 1 from ledger.${table} where user_id = $1`,
          [USER_A],
        );
        expect({ table, rowCount }).toEqual({ table, rowCount: 0 });
      }
    });
  });

  it('inserting A’s row, with A’s user_id, is refused by the policy in every table', async () => {
    for (const table of tables) {
      const row = await rowOf(table, USER_A);
      const state = await asApp(db, USER_B, (client) =>
        sqlState(
          client.query(
            `insert into ledger.${table} select * from jsonb_populate_record(null::ledger.${table}, $1)`,
            [row],
          ),
        ),
      );
      expect({ table, state }).toEqual({ table, state: '42501' });
    }
  });

  it('moving one of B’s rows to A is refused by the policy in every table', async () => {
    for (const table of tables) {
      const state = await asApp(db, USER_B, (client) =>
        sqlState(client.query(`update ledger.${table} set user_id = $1`, [USER_A])),
      );
      expect({ table, state }).toEqual({ table, state: '42501' });
    }
  });

  it('updating or deleting A’s rows touches nothing', async () => {
    for (const table of tables) {
      const counts = await asApp(db, USER_B, async (client) => ({
        updated: (
          await client.query(`update ledger.${table} set user_id = user_id where user_id = $1`, [
            USER_A,
          ])
        ).rowCount,
        deleted: (await client.query(`delete from ledger.${table} where user_id = $1`, [USER_A]))
          .rowCount,
      }));
      expect({ table, ...counts }).toEqual({ table, updated: 0, deleted: 0 });
    }
    const { rows } = await db.owner.query<{ n: string }>(
      'select count(*) as n from ledger.holding where user_id = $1',
      [USER_A],
    );
    expect(rows[0]?.n).toBe('3');
  });

  it('no composite foreign key can point at one of A’s rows', async () => {
    const { rows: keys } = await db.owner.query<{
      name: string;
      child: string;
      parent: string;
      childColumns: string[];
      parentColumns: string[];
    }>(
      `select k.conname as name, c.relname as child, p.relname as parent,
              array(select a.attname::text from unnest(k.conkey) with ordinality u(n, o)
                      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n
                     order by u.o) as "childColumns",
              array(select a.attname::text from unnest(k.confkey) with ordinality u(n, o)
                      join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n
                     order by u.o) as "parentColumns"
         from pg_constraint k
         join pg_class c on c.oid = k.conrelid
         join pg_class p on p.oid = k.confrelid
         join pg_namespace n on n.oid = c.relnamespace
        where k.contype = 'f' and n.nspname = 'ledger' and cardinality(k.conkey) > 1
        order by 1`,
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const parentRow = await rowOf(key.parent, USER_A);
      const childRow = await rowOf(key.child, USER_B);
      const { rows: pk } = await db.owner.query<{ column: string }>(
        `select a.attname as column from pg_index x
           join pg_attribute a on a.attrelid = x.indrelid and a.attnum = any(x.indkey)
          where x.indrelid = $1::regclass and x.indisprimary`,
        [`ledger.${key.child}`],
      );
      // Point B's row at A's parent row, keeping user_id (B's: the policy forbids changing it).
      const targets = key.childColumns
        .map((column, i) => ({ column, value: parentRow[key.parentColumns[i] ?? ''] }))
        .filter((t) => t.column !== 'user_id');
      const values: unknown[] = targets.map((t) => t.value);
      const set = targets.map((t, i) => `${t.column} = $${i + 1}`).join(', ');
      const where = pk
        .map(({ column }, i) => {
          values.push(childRow[column]);
          return `${column} = $${targets.length + i + 1}`;
        })
        .join(' and ');
      const result = await asApp(db, USER_B, (client) =>
        sqlState(client.query(`update ledger.${key.child} set ${set} where ${where}`, values)),
      );
      expect({ key: key.name, result }).toEqual({ key: key.name, result: '23503' });
    }
  });
});

describe('as netnet_app with no user set', () => {
  it('every ledger table returns nothing', async () => {
    await asApp(db, null, async (client) => {
      for (const table of tables) {
        const { rowCount } = await client.query(`select * from ledger.${table}`);
        expect({ table, rowCount }).toEqual({ table, rowCount: 0 });
      }
    });
  });

  it('every ledger table returns nothing once a setting has come and gone, or is empty', async () => {
    const client = await db.app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.user_id', $1, true)`, [USER_A]);
      await client.query('commit');
      for (const table of tables) {
        const { rowCount } = await client.query(`select * from ledger.${table}`);
        expect({ table, rowCount }).toEqual({ table, rowCount: 0 });
      }
      await client.query(`select set_config('app.user_id', '', false)`);
      for (const table of tables) {
        const { rowCount } = await client.query(`select * from ledger.${table}`);
        expect({ table, rowCount }).toEqual({ table, rowCount: 0 });
      }
    } finally {
      await client.query(`reset app.user_id`);
      client.release();
    }
  });

  it('cannot write a row for anyone', async () => {
    const row = await rowOf('ledger_state', USER_B);
    const state = await asApp(db, null, (client) =>
      sqlState(
        client.query(
          `insert into ledger.ledger_state select * from jsonb_populate_record(null::ledger.ledger_state, $1)`,
          [{ ...row, user_id: 'usr_01K1G4KX00CCCCCCCCCCCCCCCC' }],
        ),
      ),
    );
    expect(state).toBe('42501');
  });
});

describe('through withUser as B', () => {
  it('a raw SELECT * on every ledger table returns none of A’s rows', async () => {
    const seen = await db.withUser(USER_B, { kind: 'user' }, async (tx) => {
      const out: Record<string, string> = {};
      for (const table of tables) {
        const result = await tx.db.execute(sql.raw(`select * from ledger.${table}`));
        out[table] = JSON.stringify(result.rows);
      }
      return out;
    });
    for (const table of tables) {
      expect(seen[table]).toContain(USER_B);
      expect(seen[table]).not.toContain(USER_A);
      expect(seen[table]).not.toContain(MARKER_A);
    }
  });
});
