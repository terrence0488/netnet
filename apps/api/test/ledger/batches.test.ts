import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLedger } from '../../src/ledger/ledger';
import { BATCH_WINDOW_MS } from '../../src/ledger/write';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import { agentActor, auditRows, ledgerSuite, like, USER, type LedgerSuite } from './support';

/** Batches (architecture §6.8): one agent turn, by the 120 s rule, exact under the per-user lock. */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function setUp() {
  suite.clock.set(FIXED_NOW);
  const userId = await suite.newUser('USD');
  const connection = await suite.connect(userId);
  const holding = await suite
    .as(userId)
    .write((l) =>
      l.createHolding({ name: 'Account', kind: 'asset', universal: 'cash', currency: 'USD' }),
    );
  return { userId, connection, holdingId: holding.result.id };
}

let day = 0;

/** A value on a date no other test write uses. */
function nextValue(holdingId: string) {
  day += 1;
  const date = new Date(Date.UTC(2025, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
  return { holdingId, amount: day, date };
}

async function batches(userId: string) {
  return suite.rows<{ id: string; connection_id: string; opened_at: Date; last_write_at: Date }>(
    'select id, connection_id, opened_at, last_write_at from ledger.batch where user_id = $1 order by opened_at, id',
    [userId],
  );
}

describe('the 120 s rule', () => {
  it('joins writes at most 120 s apart, by the injected clock, and opens a new batch after', async () => {
    const { userId, connection, holdingId } = await setUp();
    const agent = suite.as(userId, agentActor(connection));
    const first = await agent.write((l) => l.recordValues([nextValue(holdingId)]));
    suite.clock.advance(BATCH_WINDOW_MS);
    const second = await agent.write((l) => l.recordValues([nextValue(holdingId)]));
    suite.clock.advance(BATCH_WINDOW_MS);
    const third = await agent.write((l) =>
      l.createHolding({ name: 'Savings', kind: 'asset', universal: 'cash', currency: 'EUR' }),
    );
    suite.clock.advance(BATCH_WINDOW_MS + 1);
    const fourth = await agent.write((l) => l.recordValues([nextValue(holdingId)]));

    const batchOf = (w: { result: unknown }) =>
      Array.isArray(w.result)
        ? (w.result[0] as { value: { batchId: string } }).value.batchId
        : undefined;
    expect(batchOf(first)).toBe(batchOf(second));
    expect(batchOf(fourth)).not.toBe(batchOf(first));
    const rows = await batches(userId);
    expect(rows).toEqual([
      {
        id: batchOf(first),
        connection_id: connection,
        opened_at: FIXED_NOW,
        last_write_at: new Date(FIXED_NOW.getTime() + 2 * BATCH_WINDOW_MS),
      },
      like({ id: batchOf(fourth) }),
    ]);
    const audits = await auditRows(suite, userId);
    const thirdAudit = audits.find((a) => a.entity_id === third.result.id);
    expect(thirdAudit?.batch_id).toBe(batchOf(first));
  });

  it('keeps one connection’s batch across another’s writes and the user’s, which have none', async () => {
    const { userId, connection, holdingId } = await setUp();
    const other = await suite.connect(userId);
    const first = await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([nextValue(holdingId)]));
    suite.clock.advance(60_000);
    const theirs = await suite
      .as(userId, agentActor(other))
      .write((l) => l.recordValues([nextValue(holdingId)]));
    const user = await suite.as(userId, USER).write((l) => l.recordValues([nextValue(holdingId)]));
    suite.clock.advance(60_000);
    const again = await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([nextValue(holdingId)]));
    expect(again.result[0]?.value.batchId).toBe(first.result[0]?.value.batchId);
    expect(theirs.result[0]?.value.batchId).not.toBe(first.result[0]?.value.batchId);
    expect(user.result[0]?.value.batchId).toBeNull();
    const userAudit = (await auditRows(suite, userId)).find(
      (a) => a.entity_id === user.result[0]?.value.id,
    );
    expect(userAudit).toMatchObject({
      actor: 'user',
      batch_id: null,
      connection_id: null,
      client_name: null,
    });
  });

  it('makes one recordValues call one batch, however many items', async () => {
    const { userId, connection, holdingId } = await setUp();
    const write = await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues(Array.from({ length: 50 }, () => nextValue(holdingId))));
    const ids = new Set(write.result.map((r) => r.value.batchId));
    expect(ids.size).toBe(1);
    const audits = (await auditRows(suite, userId)).filter((a) => a.entity === 'value');
    expect(new Set(audits.map((a) => a.batch_id))).toEqual(ids);
    expect(await batches(userId)).toHaveLength(1);
  });
});

describe('concurrent agent writes', () => {
  /**
   * `withUser` reads its clock once it holds the user's lock, so the instants below are handed
   * out in the order the writes run, whichever call gets which.
   */
  async function concurrently(steps: readonly number[]) {
    const { userId, connection, holdingId } = await setUp();
    let at = FIXED_NOW.getTime();
    let call = 0;
    const clock = () => {
      at += steps[call] ?? 0;
      call += 1;
      return new Date(at);
    };
    const pool = db.appPool({ max: steps.length });
    // Dropping the database at the end ends these connections; that is not an error here.
    pool.on('error', () => undefined);
    const withUser = db.withUserOn(pool, clock);
    const items = steps.map(() => nextValue(holdingId));
    await Promise.all(
      items.map((item) =>
        withUser(
          userId,
          agentActor(connection),
          (tx) => openLedger(tx, suite.options()).recordValues([item]),
          { write: true },
        ),
      ),
    );
    const audits = (await auditRows(suite, userId)).filter((a) => a.entity === 'value');
    const sizes = new Map<string, number>();
    for (const a of audits)
      sizes.set(a.batch_id ?? 'none', (sizes.get(a.batch_id ?? 'none') ?? 0) + 1);
    return { batches: await batches(userId), sizes: [...sizes.values()] };
  }

  it('groups writes that each follow the previous within 120 s into one batch', async () => {
    const result = await concurrently([0, 60_000, 60_000, 60_000, 60_000, 60_000]);
    expect(result.sizes).toEqual([6]);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]?.last_write_at).toEqual(new Date(FIXED_NOW.getTime() + 5 * 60_000));
  });

  it('splits them exactly where a gap is longer than 120 s', async () => {
    const result = await concurrently([0, 60_000, 60_000, 121_000, 60_000, 60_000, 121_000]);
    expect(result.sizes).toEqual([3, 3, 1]);
    expect(result.batches).toHaveLength(3);
  });
});
