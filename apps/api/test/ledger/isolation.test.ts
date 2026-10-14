import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEDGER_READS, LEDGER_WRITES, type Ledger } from '../../src/ledger/ledger';
import {
  CONNECTION_B,
  MARKER_A,
  USER_A,
  USER_B,
  createTestDatabase,
  seedUsers,
  type Fixtures,
  type TestDatabase,
} from '../isolation/harness';
import { USER, agentActor, appError, ledgerSuite, type LedgerSuite } from './support';

/**
 * Every Ledger method, called by user B with user A's ids (CONVENTIONS §9, §11): NOT_FOUND, never
 * "forbidden", none of A's data in what B gets back, and A's ledger exactly as it was. The table
 * has a case for every method; a method added without one fails the first test.
 */
let db: TestDatabase;
let suite: LedgerSuite;
let fixtures: Fixtures;
let aIds: string[];

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
  fixtures = await seedUsers(db);
  const { a } = fixtures;
  aIds = [...a.typeIds, a.tagId, ...a.holdingIds, ...a.valueIds, a.batchId, ...a.auditIds];
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** All of A's rows, as the owner sees them. */
async function ledgerOfA(): Promise<string> {
  const tables = [
    'ledger_state',
    'user_type',
    'tag',
    'holding',
    'holding_tag',
    'batch',
    'value',
    'prefs',
    'audit',
  ];
  const out: Record<string, unknown[]> = {};
  for (const table of tables) {
    out[table] = await suite.rows(
      `select * from ledger.${table} where user_id = $1 order by 1, 2`,
      [USER_A],
    );
  }
  return JSON.stringify(out);
}

/** What B got back carries none of A's names, and none of A's ids beyond those B sent. */
function expectNothingOfA(got: unknown, sent: readonly string[] = []): void {
  const text = JSON.stringify(got instanceof Error ? { ...got, message: got.message } : got) ?? '';
  expect(text).not.toContain(MARKER_A);
  for (const id of aIds) if (!sent.includes(id)) expect(text).not.toContain(id);
}

type Call = (l: Ledger) => Promise<unknown>;
type Case =
  { name: string; call: Call; sent: () => string[] } | { name: string; call: Call; returns: true };

const a = () => fixtures.a;
const b = () => fixtures.b;

const CASES: Record<keyof Ledger, Case[]> = {
  init: [
    {
      name: 'B’s init leaves A alone',
      call: (l) => l.init({ baseCurrency: 'USD', pack: suite.content.ref('qz') }),
      returns: true,
    },
  ],
  snapshot: [{ name: 'B’s snapshot', call: (l) => l.snapshot(), returns: true }],
  context: [{ name: 'B’s context', call: (l) => l.context(), returns: true }],
  listHoldings: [
    {
      name: 'A’s type',
      call: (l) => l.listHoldings({ typeIds: [a().typeIds[0]!] }),
      sent: () => [a().typeIds[0]!],
    },
    {
      name: 'A’s tag',
      call: (l) => l.listHoldings({ tagIds: [a().tagId] }),
      sent: () => [a().tagId],
    },
    {
      name: 'everything B has',
      call: (l) => l.listHoldings({ archived: 'include' }),
      returns: true,
    },
  ],
  getHolding: [
    {
      name: 'A’s holding',
      call: (l) => l.getHolding(a().holdingIds[0]!),
      sent: () => [a().holdingIds[0]!],
    },
  ],
  history: [
    {
      name: 'A’s type',
      call: (l) => l.history({ typeIds: [a().typeIds[0]!] }),
      sent: () => [a().typeIds[0]!],
    },
    { name: 'A’s tag', call: (l) => l.history({ tagIds: [a().tagId] }), sent: () => [a().tagId] },
  ],
  periods: [{ name: 'B’s periods', call: (l) => l.periods({ view: 'monthly' }), returns: true }],
  createHolding: [
    {
      name: 'A’s type',
      call: (l) =>
        l.createHolding({ name: 'X', kind: 'asset', typeId: a().typeIds[0]!, currency: 'EUR' }),
      sent: () => [a().typeIds[0]!],
    },
    {
      name: 'A’s tag',
      call: (l) =>
        l.createHolding({
          name: 'X',
          kind: 'asset',
          universal: 'cash',
          currency: 'EUR',
          tagIds: [a().tagId],
        }),
      sent: () => [a().tagId],
    },
  ],
  updateHolding: [
    {
      name: 'A’s holding',
      call: (l) => l.updateHolding(a().holdingIds[0]!, { name: 'X' }),
      sent: () => [a().holdingIds[0]!],
    },
    {
      name: 'B’s holding, A’s type',
      call: (l) => l.updateHolding(b().holdingIds[0]!, { typeId: a().typeIds[1]! }),
      sent: () => [a().typeIds[1]!],
    },
    {
      name: 'B’s holding, A’s tag',
      call: (l) => l.updateHolding(b().holdingIds[0]!, { tagIds: [a().tagId] }),
      sent: () => [a().tagId],
    },
  ],
  deleteHolding: [
    {
      name: 'A’s holding',
      call: (l) => l.deleteHolding(a().holdingIds[0]!),
      sent: () => [a().holdingIds[0]!],
    },
  ],
  recordValues: [
    {
      name: 'A’s holding',
      call: (l) => l.recordValues([{ holdingId: a().holdingIds[0]!, amount: '1' }]),
      sent: () => [a().holdingIds[0]!],
    },
  ],
  updateValue: [
    {
      name: 'A’s value',
      call: (l) => l.updateValue(a().valueIds[0]!, { amount: '1' }),
      sent: () => [a().valueIds[0]!],
    },
  ],
  deleteValue: [
    {
      name: 'A’s value',
      call: (l) => l.deleteValue(a().valueIds[0]!),
      sent: () => [a().valueIds[0]!],
    },
  ],
  upsertType: [
    {
      name: 'A’s type',
      call: (l) => l.upsertType({ id: a().typeIds[0]!, name: 'X' }),
      sent: () => [a().typeIds[0]!],
    },
  ],
  deleteType: [
    { name: 'A’s type', call: (l) => l.deleteType(a().typeIds[0]!), sent: () => [a().typeIds[0]!] },
    {
      name: 'B’s type into A’s',
      call: (l) => l.deleteType(b().typeIds[0]!, a().typeIds[0]),
      sent: () => [a().typeIds[0]!],
    },
  ],
  upsertTag: [
    {
      name: 'A’s tag',
      call: (l) => l.upsertTag({ id: a().tagId, name: 'X' }),
      sent: () => [a().tagId],
    },
    { name: 'a new tag of B’s', call: (l) => l.upsertTag({ name: 'Long term' }), returns: true },
  ],
  deleteTag: [
    { name: 'A’s tag', call: (l) => l.deleteTag(a().tagId), sent: () => [a().tagId] },
    {
      name: 'B’s tag into A’s',
      call: (l) => l.deleteTag(b().tagId, a().tagId),
      sent: () => [a().tagId],
    },
  ],
  setPrefs: [
    {
      name: 'A’s ids in a filter',
      call: (l) =>
        l.setPrefs({
          homeFilter: { typeIds: [a().typeIds[0]!], tagIds: [a().tagId] },
          insightsFilter: { hideHoldingIds: [a().holdingIds[0]!] },
        }),
      sent: () => [a().typeIds[0]!, a().tagId, a().holdingIds[0]!],
    },
  ],
  applyPackTypes: [
    {
      name: 'B’s pack types',
      call: (l) => l.applyPackTypes(suite.content.ref('qz')),
      returns: true,
    },
  ],
  changeCountry: [
    {
      name: 'B’s country change leaves A alone',
      call: (l) => l.changeCountry({ baseCurrency: 'GBP', pack: suite.content.ref('qz') }),
      returns: true,
    },
  ],
  changeBaseCurrency: [
    {
      name: 'B’s currency change leaves A alone',
      call: (l) => l.changeBaseCurrency('GBP'),
      returns: true,
    },
  ],
  exportAll: [{ name: 'B’s export', call: (l) => l.exportAll(), returns: true }],
  // Last: it deletes B’s ledger, so nothing after it may read B’s rows.
  destroy: [{ name: 'B’s own ledger only', call: (l) => l.destroy(), returns: true }],
};

describe('isolation', () => {
  it('has a case for every Ledger method', () => {
    expect(Object.keys(CASES).sort()).toEqual([...LEDGER_READS, ...LEDGER_WRITES].sort());
  });

  // Before the cases: the last one deletes B’s ledger.
  it('gives B’s snapshot and context only B’s rows', async () => {
    const snapshot = await suite.as(USER_B).read((l) => l.snapshot());
    expect(snapshot.holdings.map((h) => h.id).sort()).toEqual([...b().holdingIds].sort());
    const context = await suite.as(USER_B).read((l) => l.context());
    expect(context.connections.map((c) => c.id)).toEqual([CONNECTION_B]);
    expect(context.values.map((v) => v.id).sort()).toEqual([...b().valueIds].sort());
  });

  const cases = Object.entries(CASES).flatMap(([method, list]) =>
    list.map((c) => [method, c.name, c] as const),
  );

  it.each(cases)('%s with %s: NOT_FOUND or B’s own data, and A untouched', async (method, _, c) => {
    const before = await ledgerOfA();
    const write = (LEDGER_WRITES as readonly string[]).includes(method);
    const call = (actor = USER) => {
      const run = suite.as(USER_B, actor);
      return write ? run.write(c.call) : run.read(c.call);
    };
    if ('returns' in c) {
      expectNothingOfA(await call());
    } else {
      // As the person and as their agent: a NOT_FOUND changes nothing, so both can try.
      for (const actor of [USER, agentActor(CONNECTION_B)]) {
        const error = await appError(call(actor));
        expect(error.code).toBe('NOT_FOUND');
        expectNothingOfA(error, c.sent());
      }
    }
    expect(await ledgerOfA()).toBe(before);
  });
});
