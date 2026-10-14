import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { USER, agentActor, dataVersion, ledgerSuite, newUserId, type LedgerSuite } from './support';

/**
 * `exportAll` (PRD J10): everything, to rebuild a spreadsheet from — every holding with its
 * accessibility outcome and the answer behind it, every value with its currency, rate and rate
 * date, and the types with their labels. All data is fictional (CONVENTIONS §6).
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

describe('exportAll', () => {
  it('is empty before the ledger exists', async () => {
    const bundle = await suite.as(newUserId()).read((l) => l.exportAll());
    expect(bundle.baseCurrency).toBeNull();
    expect(bundle.dataVersion).toBeNull();
    expect(bundle.types).toStrictEqual([]);
    expect(bundle.tags).toStrictEqual([]);
    expect(bundle.holdings).toStrictEqual([]);
    expect(bundle.values).toStrictEqual([]);
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('carries every holding, value, rate and rate date', async () => {
    const userId = await suite.newUser('EUR');
    const connection = await suite.connect(userId);
    const user = suite.as(userId, USER);
    const agent = suite.as(userId, agentActor(connection));
    const cash = await suite.typeId(userId, 'cash');
    const listed = await suite.typeId(userId, 'listed');
    const rainy = (await user.write((l) => l.upsertTag({ name: 'rainy day' }))).result;
    const joint = (await user.write((l) => l.upsertTag({ name: 'joint' }))).result;

    const pot = (
      await user.write((l) =>
        l.createHolding({
          name: 'Rainy day pot',
          kind: 'asset',
          typeId: cash,
          currency: 'USD',
          tagIds: [rainy.id, joint.id],
          opening: { amount: '100', date: '2026-07-01' },
        }),
      )
    ).result;
    // The statement's own rate, kept as given.
    await user.write((l) =>
      l.recordValues([
        { holdingId: pot.id, amount: '200', date: '2026-07-15', currency: 'USD', fxRate: '0.81' },
      ]),
    );
    // An agent's value, with its name on it.
    await agent.write((l) =>
      l.recordValues([{ holdingId: pot.id, amount: '50', date: '2026-07-20' }]),
    );
    await user.write((l) =>
      l.createHolding({
        name: 'Flat loan',
        kind: 'liability',
        typeId: listed,
        currency: 'EUR',
        opening: { amount: '5000', date: '2026-07-01' },
      }),
    );
    // Renamed, so the export carries the user's own label.
    await user.write((l) => l.upsertType({ id: listed, name: 'My shares' }));

    const bundle = await suite.as(userId).read((l) => l.exportAll());
    expect(bundle.baseCurrency).toBe('EUR');
    expect(bundle.dataVersion).toBe(await dataVersion(suite, userId));

    // Types: the universals, the country pack's type, and the labels each carries now.
    const labels = new Map(bundle.types.map((t) => [t.id, t.label]));
    expect(labels.get(cash)).toBe('Current account');
    expect(labels.get(listed)).toBe('My shares');
    expect(bundle.types.find((t) => t.packTypeKey === 'auto_loan')?.label).toBe('Auto loan');
    expect(bundle.tags.map((t) => t.name).sort()).toStrictEqual(['joint', 'rainy day']);

    // Holdings: the outcome and the answer behind it.
    expect(bundle.holdings.map((h) => h.name).sort()).toStrictEqual(['Flat loan', 'Rainy day pot']);
    const exported = bundle.holdings.find((h) => h.id === pot.id)!;
    expect(exported.access).toBe('accessible');
    expect(exported.accessReason).toBe('it is money in the bank');
    expect(exported.accessBasis).toMatchObject({ via: 'default', pack: 'generic' });
    expect(exported.tagIds).toStrictEqual([joint.id, rainy.id].sort());
    const loan = bundle.holdings.find((h) => h.name === 'Flat loan')!;
    expect([loan.access, loan.accessReason, loan.accessBasis]).toStrictEqual([null, null, null]);

    // Values: every one, with its currency, rate and rate date, oldest first per holding.
    const values = bundle.values.filter((v) => v.holdingId === pot.id);
    expect(values.map((v) => v.date)).toStrictEqual(['2026-07-01', '2026-07-15', '2026-07-20']);
    const [opening, stated, agents] = values;
    expect(opening).toMatchObject({
      amountMinor: 10000,
      currency: 'USD',
      baseCurrency: 'EUR',
      fxSource: 'ecb',
      source: 'web',
      clientName: null,
    });
    expect(opening!.fxRateDate).toBe('2026-07-01');
    expect(stated).toMatchObject({
      amountMinor: 20000,
      fxRate: '0.81',
      fxSource: 'user',
      source: 'web',
    });
    expect(agents).toMatchObject({
      amountMinor: 5000,
      fxSource: 'ecb',
      source: 'agent',
      clientName: 'Fictional agent',
      connectionId: connection,
    });
    const loanValues = bundle.values.filter((v) => v.holdingId === loan.id);
    expect(loanValues).toHaveLength(1);
    expect(loanValues[0]).toMatchObject({ amountMinor: 500000, currency: 'EUR', fxSource: 'same' });
  });
});
