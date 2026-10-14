import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEDGER_READS, LEDGER_WRITES, openLedger, type Ledger } from '../../src/ledger/ledger';
import { FIXED_NOW, createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  auditRows,
  dataVersion,
  ledgerSuite,
  newUserId,
  rowCounts,
  USER,
  type LedgerSuite,
} from './support';

/**
 * CONVENTIONS §10 and architecture §6.8: every write is one transaction with one audit row per
 * entity it touches and `data_version + 1`. The table below has a case for every write method the
 * Ledger has; a method added without one fails the first test.
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

interface Fixture {
  userId: string;
  connection: string;
  holdingId: string;
  valueId: string;
  typeId: string;
  cashTypeId: string;
  tagId: string;
  otherTagId: string;
  /** The value correction `undo` reverses. Only `setUp('undo')` sets it. */
  undoEntryId?: string;
}

/** A user (with no country pack yet) whose ledger has one of everything a write can touch. */
async function fixture(): Promise<Fixture> {
  const userId = await suite.newUser('USD', null);
  const connection = await suite.connect(userId);
  const user = suite.as(userId, USER, null);
  const tagId = (await user.write((l) => l.upsertTag({ name: 'Old tag' }))).result.id;
  const otherTagId = (await user.write((l) => l.upsertTag({ name: 'Other tag' }))).result.id;
  const typeId = (await user.write((l) => l.upsertType({ name: 'Custom', universal: 'other' })))
    .result.id;
  const holding = await user.write((l) =>
    l.createHolding({
      name: 'Holding',
      kind: 'asset',
      typeId,
      currency: 'USD',
      tagIds: [tagId],
      access: 'now',
      opening: { amount: '10', date: '2026-07-01' },
    }),
  );
  const [value] = await suite.rows<{ id: string }>(
    'select id from ledger.value where user_id = $1',
    [userId],
  );
  return {
    userId,
    connection,
    holdingId: holding.result.id,
    valueId: value!.id,
    typeId,
    cashTypeId: await suite.typeId(userId, 'cash'),
    tagId,
    otherTagId,
  };
}

type WriteMethod = (typeof LEDGER_WRITES)[number];
type Touch = [entity: string, action: 'create' | 'update' | 'delete'];

const CASES: Record<
  WriteMethod,
  { run: (l: Ledger, f: Fixture) => Promise<unknown>; touches: Touch[] }
> = {
  init: {
    run: (l) => l.init({ baseCurrency: 'USD', pack: suite.content.ref('qz') }),
    touches: [['ledger', 'create'], ...Array.from({ length: 13 }, (): Touch => ['type', 'create'])],
  },
  createHolding: {
    run: (l) =>
      l.createHolding({
        name: 'New',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        opening: { amount: 1 },
      }),
    touches: [
      ['holding', 'create'],
      ['value', 'create'],
    ],
  },
  updateHolding: {
    run: (l, f) => l.updateHolding(f.holdingId, { name: 'Renamed', archived: true }),
    touches: [['holding', 'update']],
  },
  deleteHolding: { run: (l, f) => l.deleteHolding(f.holdingId), touches: [['holding', 'delete']] },
  recordValues: {
    run: (l, f) =>
      l.recordValues([
        { holdingId: f.holdingId, amount: 2, date: '2026-07-02' },
        { holdingId: f.holdingId, amount: 3, date: '2026-07-01' },
      ]),
    touches: [
      ['value', 'create'],
      ['value', 'update'],
    ],
  },
  updateValue: {
    run: (l, f) => l.updateValue(f.valueId, { amount: 11 }),
    touches: [['value', 'update']],
  },
  deleteValue: { run: (l, f) => l.deleteValue(f.valueId), touches: [['value', 'delete']] },
  upsertType: {
    run: (l, f) => l.upsertType({ id: f.typeId, name: 'Renamed' }),
    touches: [['type', 'update']],
  },
  deleteType: {
    run: (l, f) => l.deleteType(f.typeId, f.cashTypeId),
    touches: [
      ['holding', 'update'],
      ['type', 'delete'],
    ],
  },
  upsertTag: { run: (l) => l.upsertTag({ name: 'New tag' }), touches: [['tag', 'create']] },
  deleteTag: {
    run: (l, f) => l.deleteTag(f.tagId, f.otherTagId),
    touches: [
      ['holding', 'update'],
      ['tag', 'delete'],
    ],
  },
  undo: {
    // Without `setUp('undo')` (the read-transaction probe) the id only needs its shape.
    run: (l, f) => l.undo({ entryId: f.undoEntryId ?? 'aud_01K1G4KX00ZZZZZZZZZZZZZZZZ' }),
    touches: [['value', 'update']],
  },
  setPrefs: { run: (l) => l.setPrefs({ baseline: 'year_start' }), touches: [['prefs', 'create']] },
  // The fixture's one USD value re-derived into EUR, then the base currency itself.
  changeBaseCurrency: {
    run: (l) => l.changeBaseCurrency('EUR'),
    touches: [
      ['value', 'update'],
      ['ledger', 'update'],
    ],
  },
  applyPackTypes: {
    run: (l) => l.applyPackTypes(suite.content.ref('qz')),
    touches: [['type', 'create']],
  },
  // The fixture has a holding, so the currency stays and the pack's type is added.
  changeCountry: {
    run: (l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }),
    touches: [['type', 'create']],
  },
  // `destroy` deletes the audit log itself, so it touches nothing auditable: the audit-shape test
  // below skips it, and `destroy.test.ts` checks what it deletes instead.
  destroy: { run: (l) => l.destroy(), touches: [] },
};

/** The fixture for a case: `init` starts from a user with no ledger. */
async function setUp(method: WriteMethod): Promise<Fixture> {
  if (method === 'init') {
    const userId = newUserId();
    const connection = await suite.connect(userId);
    return { userId, connection } as Fixture;
  }
  const f = await fixture();
  // `undo` reverses a correction of the fixture's value, made before the case runs.
  if (method === 'undo') {
    await suite.as(f.userId, USER, null).write((l) => l.updateValue(f.valueId, { amount: 11 }));
    const [entry] = await suite.rows<{ id: string }>(
      `select id from ledger.audit where user_id = $1 and entity = 'value' and entity_id = $2
        order by at desc, id desc limit 1`,
      [f.userId, f.valueId],
    );
    f.undoEntryId = entry?.id ?? '';
  }
  return f;
}

describe('the write methods', () => {
  it('are every Ledger method that is not a read, and each has a case below', () => {
    const tx = {
      db: {} as never,
      userId: 'usr_x',
      actor: USER,
      write: false,
      now: () => FIXED_NOW,
    };
    const methods = Object.keys(openLedger(tx, suite.options())).sort();
    expect(methods).toEqual([...LEDGER_READS, ...LEDGER_WRITES].sort());
    expect(Object.keys(CASES).sort()).toEqual([...LEDGER_WRITES].sort());
  });

  it.each(LEDGER_WRITES.filter((method) => method !== 'destroy'))(
    '%s: one audit row per entity touched, with the actor, client, connection and batch; data_version + 1',
    async (method) => {
      const f = await setUp(method);
      const version = (await dataVersion(suite, f.userId)) ?? 0;
      const seen = (await auditRows(suite, f.userId)).length;
      await suite
        .as(f.userId, agentActor(f.connection), null)
        .write((l) => CASES[method].run(l, f));

      expect(await dataVersion(suite, f.userId)).toBe(version + 1);
      const audits = (await auditRows(suite, f.userId)).slice(seen);
      expect(audits.map((a) => [a.entity, a.action])).toEqual(CASES[method].touches);
      const [batch] = await suite.rows<{ id: string }>(
        'select id from ledger.batch where user_id = $1 and connection_id = $2',
        [f.userId, f.connection],
      );
      for (const audit of audits) {
        expect(audit).toMatchObject({
          actor: 'agent',
          client_name: 'Fictional agent',
          connection_id: f.connection,
          batch_id: batch?.id,
          entity_id: anyString,
        });
        if (audit.action === 'create')
          expect([audit.before, audit.after !== null]).toEqual([null, true]);
        if (audit.action === 'delete')
          expect([audit.before !== null, audit.after]).toEqual([true, null]);
        if (audit.action === 'update') {
          expect(audit.before).not.toBeNull();
          expect(audit.after).not.toBeNull();
          expect(audit.before).not.toEqual(audit.after);
        }
      }
    },
  );

  it.each(LEDGER_WRITES)('%s: writes nothing when its transaction rolls back', async (method) => {
    const f = await setUp(method);
    const counts = await rowCounts(suite, f.userId);
    const version = await dataVersion(suite, f.userId);
    await expect(
      suite.as(f.userId, agentActor(f.connection), null).write(async (l) => {
        await CASES[method].run(l, f);
        throw new Error('something after it failed');
      }),
    ).rejects.toThrow('something after it failed');
    expect(await rowCounts(suite, f.userId)).toEqual(counts);
    expect(await dataVersion(suite, f.userId)).toBe(version);
  });

  it.each(LEDGER_WRITES)('%s: refuses to run in a read transaction', async (method) => {
    const f = await fixture();
    await expect(
      suite.as(f.userId, USER, null).read((l) => CASES[method].run(l, f)),
    ).rejects.toThrow(`Ledger.${method}() writes`);
  });
});

describe('the read methods', () => {
  it('write nothing, even inside a write transaction', async () => {
    const f = await fixture();
    const counts = await rowCounts(suite, f.userId);
    const version = await dataVersion(suite, f.userId);
    await suite.as(f.userId, USER, null).write(async (l) => {
      await l.snapshot();
      await l.context();
      await l.listHoldings({});
      await l.getHolding(f.holdingId);
      await l.history({});
      await l.exportAll();
      await l.activity({});
    });
    expect(await rowCounts(suite, f.userId)).toEqual(counts);
    expect(await dataVersion(suite, f.userId)).toBe(version);
  });
});
