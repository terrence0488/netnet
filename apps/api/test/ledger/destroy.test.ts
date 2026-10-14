import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  USER,
  agentActor,
  dataVersion,
  ledgerSuite,
  newUserId,
  rowCounts,
  type LedgerSuite,
} from './support';

/**
 * `destroy` (PRD J10): every ledger row for this user, gone — state, types, tags, holdings, links,
 * batches, values, prefs and the audit log itself. Only `DELETE /api/account` calls it. All data
 * is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** A user whose ledger holds one of everything `destroy` deletes. */
async function fixture(): Promise<string> {
  const userId = await suite.newUser('USD');
  const connection = await suite.connect(userId);
  const user = suite.as(userId, USER);
  const tag = (await user.write((l) => l.upsertTag({ name: 'Old tag' }))).result;
  const holding = (
    await suite.as(userId, agentActor(connection)).write((l) =>
      l.createHolding({
        name: 'Holding',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        tagIds: [tag.id],
        opening: { amount: '10', date: '2026-07-01' },
      }),
    )
  ).result;
  await user.write((l) => l.recordValues([{ holdingId: holding.id, amount: '11' }]));
  await user.write((l) => l.setPrefs({ baseline: 'year_start' }));
  return userId;
}

const EMPTY = {
  ledger_state: 0,
  user_type: 0,
  tag: 0,
  holding: 0,
  holding_tag: 0,
  batch: 0,
  value: 0,
  prefs: 0,
  audit: 0,
};

describe('destroy', () => {
  it('deletes every ledger row for the user, and nothing else’s', async () => {
    const userId = await fixture();
    const other = await fixture();
    const othersBefore = await rowCounts(suite, other);
    expect(Object.values(await rowCounts(suite, userId)).every((n) => n > 0)).toBe(true);

    await suite.as(userId).write((l) => l.destroy());

    expect(await rowCounts(suite, userId)).toStrictEqual(EMPTY);
    expect(await dataVersion(suite, userId)).toBeNull();
    expect(await rowCounts(suite, other)).toStrictEqual(othersBefore);
    // The ledger starts over afterwards.
    await suite
      .as(userId)
      .write((l) => l.init({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    expect(await dataVersion(suite, userId)).toBe(1);
  });

  it('deletes nothing before the ledger exists', async () => {
    const userId = newUserId();
    await suite.as(userId).write((l) => l.destroy());
    expect(await rowCounts(suite, userId)).toStrictEqual(EMPTY);
  });

  it('refuses to run in a read transaction', async () => {
    const userId = await fixture();
    await expect(suite.as(userId).read((l) => l.destroy())).rejects.toThrow(
      'Ledger.destroy() writes',
    );
    expect(await dataVersion(suite, userId)).not.toBeNull();
  });

  it('writes nothing when its transaction rolls back', async () => {
    const userId = await fixture();
    const counts = await rowCounts(suite, userId);
    await expect(
      suite.as(userId).write(async (l) => {
        await l.destroy();
        throw new Error('something after it failed');
      }),
    ).rejects.toThrow('something after it failed');
    expect(await rowCounts(suite, userId)).toStrictEqual(counts);
  });
});
