import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConnectionRevoked, type Actor, type LedgerTx } from '../../src/ledger/with-user';
import {
  CONNECTION_A,
  CONNECTION_A_REVOKED,
  CONNECTION_B,
  FIXED_NOW,
  USER_A,
  USER_B,
  createTestDatabase,
  seedUsers,
  type Fixtures,
  type TestDatabase,
} from '../isolation/harness';

/** architecture §6.1 and §7.3: what `withUser` promises, as `netnet_app`. */
let db: TestDatabase;
let fixtures: Fixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  fixtures = await seedUsers(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const user: Actor = { kind: 'user' };
const agent = (connectionId?: string): Actor =>
  connectionId === undefined ? { kind: 'agent' } : { kind: 'agent', connectionId };

async function holdingNames(tx: LedgerTx): Promise<string[]> {
  const { rows } = await tx.db.execute<{ name: string }>(
    sql`select name from ledger.holding order by name`,
  );
  return rows.map((r) => r.name);
}

/** A callback that runs `effect` and resolves with its result: for when, and whether, it runs. */
function callback<T>(effect: (tx: LedgerTx) => T): (tx: LedgerTx) => Promise<T> {
  return (tx) => Promise.resolve(effect(tx));
}

/** Resolves once `n` `netnet_app` sessions in this database wait on a lock. */
async function lockWaiters(n: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await db.owner.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity
        where datname = current_database() and usename = 'netnet_app' and wait_event_type = 'Lock'`,
    );
    if (rows[0]?.n === n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${n} session(s) waiting on a lock`);
}

/** A promise and the function that resolves it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = () => undefined as void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('the user setting', () => {
  it('lets the callback see that user’s rows only', async () => {
    const names = await db.withUser(USER_A, user, holdingNames);
    expect(names).toHaveLength(3);
    expect(names.every((name) => name.startsWith('MARKER-A'))).toBe(true);
  });

  it('lasts for the transaction only: the next query on the same pooled connection sees nothing', async () => {
    const single = db.appPool({ max: 1 });
    const withUser = db.withUserOn(single);
    const inside = await withUser(USER_A, user, async (tx) => {
      const { rows } = await tx.db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      return { pid: rows[0]?.pid, names: await holdingNames(tx) };
    });
    expect(inside.names).toHaveLength(3);

    const after = await single.query<{ pid: number; setting: string | null; holdings: number }>(
      `select pg_backend_pid() as pid, current_setting('app.user_id', true) as setting,
              (select count(*)::int from ledger.holding) as holdings`,
    );
    expect(after.rows).toEqual([{ pid: inside.pid, setting: '', holdings: 0 }]);
  });

  it('is gone after a callback that throws, which writes nothing', async () => {
    const single = db.appPool({ max: 1 });
    const withUser = db.withUserOn(single);
    await expect(
      withUser(
        USER_A,
        user,
        async (tx) => {
          await tx.db.execute(sql`update ledger.holding set name = 'changed'`);
          throw new Error('the write failed');
        },
        { write: true },
      ),
    ).rejects.toThrow('the write failed');
    const { rows } = await single.query<{ setting: string | null; holdings: number }>(
      `select current_setting('app.user_id', true) as setting,
              (select count(*)::int from ledger.holding) as holdings`,
    );
    expect(rows).toEqual([{ setting: '', holdings: 0 }]);
    expect(await db.withUser(USER_A, user, holdingNames)).not.toContain('changed');
  });

  it('refuses an empty user id rather than opening a transaction with no user', async () => {
    await expect(db.withUser('', user, holdingNames)).rejects.toThrow(/userId/);
    await expect(db.withUser('  ', user, holdingNames)).rejects.toThrow(/userId/);
  });
});

describe('the write lock', () => {
  it('serialises two concurrent writes for one user', async () => {
    const order: string[] = [];
    const firstIn = gate();
    const release = gate();
    const first = db.withUser(
      USER_A,
      user,
      async () => {
        order.push('first started');
        firstIn.open();
        await release.opened;
        order.push('first finished');
      },
      { write: true },
    );
    await firstIn.opened;
    const second = db.withUser(
      USER_A,
      user,
      callback(() => {
        order.push('second started');
      }),
      { write: true },
    );
    await lockWaiters(1);
    expect(order).toEqual(['first started']);
    release.open();
    await Promise.all([first, second]);
    expect(order).toEqual(['first started', 'first finished', 'second started']);
  });

  it('does not hold up another user’s write, or the same user’s reads', async () => {
    const order: string[] = [];
    const firstIn = gate();
    const release = gate();
    const first = db.withUser(
      USER_A,
      user,
      async () => {
        firstIn.open();
        await release.opened;
        order.push('A write finished');
      },
      { write: true },
    );
    await firstIn.opened;
    await db.withUser(
      USER_B,
      user,
      callback(() => void order.push('B write ran')),
      {
        write: true,
      },
    );
    await db.withUser(
      USER_A,
      user,
      callback(() => void order.push('A read ran')),
    );
    release.open();
    await first;
    expect(order).toEqual(['B write ran', 'A read ran', 'A write finished']);
  });
});

describe('an agent actor', () => {
  it('passes with one of the user’s active connections', async () => {
    const names = await db.withUser(USER_A, agent(CONNECTION_A), holdingNames);
    expect(names).toHaveLength(3);
  });

  it.each([
    ['a revoked connection', CONNECTION_A_REVOKED],
    ['another user’s connection', CONNECTION_B],
    ['an unknown connection', 'con_01K1G4KX00ZZZZZZZZZZZZZZZZ'],
    ['no connection', undefined],
  ])('is rejected with %s, before the callback runs', async (_, connectionId) => {
    let ran = false;
    const call = db.withUser(
      USER_A,
      agent(connectionId),
      callback(() => {
        ran = true;
      }),
      { write: true },
    );
    await expect(call).rejects.toBeInstanceOf(ConnectionRevoked);
    await expect(call).rejects.toMatchObject({ name: 'ConnectionRevoked', connectionId });
    expect(ran).toBe(false);
  });

  it('is rejected when its connection was revoked while its write waited for the lock', async () => {
    const revoking = gate();
    const release = gate();
    const revocation = db.withUser(
      USER_A,
      user,
      async (tx) => {
        await tx.db.execute(
          sql`update core.agent_connection set revoked_at = ${FIXED_NOW} where id = ${CONNECTION_A}`,
        );
        revoking.open();
        await release.opened;
      },
      { write: true },
    );
    await revoking.opened;
    let ran = false;
    const agentWrite = db.withUser(
      USER_A,
      agent(CONNECTION_A),
      callback(() => {
        ran = true;
      }),
      { write: true },
    );
    await lockWaiters(1);
    release.open();
    await revocation;
    await expect(agentWrite).rejects.toBeInstanceOf(ConnectionRevoked);
    expect(ran).toBe(false);

    await db.owner.query(`update core.agent_connection set revoked_at = null where id = $1`, [
      CONNECTION_A,
    ]);
  });
});

describe('the transaction context', () => {
  it('carries the user, the actor and the injected clock, fixed for the transaction', async () => {
    let tick = 0;
    const clock = () => new Date(FIXED_NOW.getTime() + 1000 * tick++);
    const withUser = db.withUserOn(db.app, clock);
    const seen = await withUser(
      USER_B,
      agent(CONNECTION_B),
      callback((tx) => {
        const first = tx.now();
        first.setFullYear(2000);
        return { userId: tx.userId, actor: tx.actor, first: first.getTime(), again: tx.now() };
      }),
    );
    expect(seen.userId).toBe(USER_B);
    expect(seen.actor).toEqual({ kind: 'agent', connectionId: CONNECTION_B });
    expect(seen.again).toEqual(FIXED_NOW);
    expect(seen.first).not.toBe(FIXED_NOW.getTime());
    const next = await withUser(
      USER_B,
      user,
      callback((tx) => tx.now()),
    );
    expect(next).toEqual(new Date(FIXED_NOW.getTime() + 1000));
  });

  it('writes through to the database when the callback succeeds', async () => {
    const [holdingId] = fixtures.b.holdingIds;
    await db.withUser(
      USER_B,
      user,
      (tx) =>
        tx.db.execute(
          sql`update ledger.holding set row_version = row_version + 1 where id = ${holdingId}`,
        ),
      { write: true },
    );
    const { rows } = await db.owner.query<{ row_version: number }>(
      'select row_version from ledger.holding where user_id = $1 and id = $2',
      [USER_B, holdingId],
    );
    expect(rows).toEqual([{ row_version: 2 }]);
  });
});
