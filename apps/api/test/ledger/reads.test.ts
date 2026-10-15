import { financialContextSchema, type CreateHolding, type HoldingQuery } from '@netnet/contracts';
import { compileContext } from '@netnet/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyNumber,
  anyString,
  appError,
  ledgerSuite,
  like,
  matching,
  type LedgerSuite,
} from './support';

/** What the Ledger reads out: snapshot (§7.2), context input (§7.5), lists and history (§7.4). */
let db: TestDatabase;
let suite: LedgerSuite;
let userId: string;
let connection: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
  userId = await suite.newUser('USD');
  connection = await suite.connect(userId, 'claude');
  const revoked = await suite.connect(userId, 'chatgpt');
  await suite.rows('update core.agent_connection set revoked_at = now() where id = $1', [revoked]);
  ids.revoked = revoked;
  const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Long term' }));
  ids.tag = tag.result.id;
  const create = async (key: string, input: CreateHolding) => {
    ids[key] = (await suite.as(userId).write((l) => l.createHolding(input))).result.id;
  };
  await create('cash', {
    name: 'Everyday account',
    kind: 'asset',
    universal: 'cash',
    currency: 'USD',
  });
  await create('fund', {
    name: 'World fund',
    kind: 'asset',
    universal: 'listed',
    currency: 'EUR',
    tagIds: [ids.tag],
  });
  await create('flat', {
    name: 'Flat',
    kind: 'asset',
    universal: 'property',
    currency: 'USD',
    access: 'home',
  });
  await create('loan', {
    name: 'Home loan',
    kind: 'liability',
    universal: 'mortgage',
    currency: 'USD',
  });
  await create('old', { name: 'Old account', kind: 'asset', universal: 'cash', currency: 'USD' });
  await suite.as(userId, agentActor(connection, 'Claude')).write((l) =>
    l.recordValues([
      { holdingId: ids.cash!, amount: '1000', date: '2026-05-31' },
      { holdingId: ids.cash!, amount: '1500', date: '2026-07-31' },
      { holdingId: ids.fund!, amount: '800', date: '2026-07-31' },
      { holdingId: ids.flat!, amount: '300000', date: '2025-12-31' },
      { holdingId: ids.loan!, amount: '200000', date: '2026-03-31' },
      { holdingId: ids.old!, amount: '5', date: '2026-01-31' },
    ]),
  );
  await suite.as(userId).write((l) => l.updateHolding(ids.old!, { archived: true }));
  await suite.as(userId).write((l) => l.setPrefs({ baseline: 'last_month' }));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('snapshot', () => {
  it('has everything once, values compact per holding, oldest first', async () => {
    const snapshot = await suite.as(userId).read((l) => l.snapshot());
    expect(snapshot).toMatchObject({
      baseCurrency: 'USD',
      packRef: suite.content.ref('qz'),
      prefs: { baseline: 'last_month' },
      tags: [{ id: ids.tag, name: 'Long term', sort: 0 }],
    });
    expect(snapshot.dataVersion).toBeGreaterThan(1);
    expect(snapshot.types).toHaveLength(13);
    expect(snapshot.holdings.map((h) => h.id)).toEqual([
      ids.cash,
      ids.fund,
      ids.flat,
      ids.loan,
      ids.old,
    ]);
    const [first] = snapshot.values[ids.cash!] ?? [];
    expect(first).toEqual([
      '2026-05-31',
      100_000,
      'USD',
      100_000,
      'agent',
      'Claude',
      matching(/^val_/),
    ]);
    expect(snapshot.values[ids.cash!]).toHaveLength(2);
    expect(snapshot.values[ids.fund!]?.[0]?.slice(0, 4)).toEqual([
      '2026-07-31',
      80_000,
      'EUR',
      100_000,
    ]);
  });
});

describe('a read', () => {
  it('sees one moment: a write that commits while it runs is not in it', async () => {
    const person = await suite.newUser('USD');
    let added: string | undefined;
    const [before, after] = await suite.as(person).read(async (l) => {
      const first = await l.snapshot();
      const write = await suite.as(person).write((w) =>
        w.createHolding({
          name: 'Late account',
          kind: 'asset',
          universal: 'cash',
          currency: 'USD',
        }),
      );
      added = write.result.id;
      return [first, await l.snapshot()];
    });
    expect(after).toStrictEqual(before);
    const now = await suite.as(person).read((l) => l.snapshot());
    expect(now.holdings.map((h) => h.id)).toContain(added);
  });
});

describe('context', () => {
  it('gives compileContext every holding and value, archived included, and every connection', async () => {
    const context = await suite.as(userId).read((l) => l.context());
    expect(context.baseCurrency).toBe('USD');
    expect(context.holdings).toHaveLength(5);
    expect(context.holdings.find((h) => h.id === ids.flat)).toEqual({
      id: ids.flat,
      name: 'Flat',
      kind: 'asset',
      typeId: matching(/^typ_/),
      universal: 'property',
      currency: 'USD',
      cadenceDays: null,
      archived: false,
      access: 'locked',
      tagIds: [],
      accessReason: 'it is your home',
      accessUntil: 'while you live in it',
      accessBasis: {
        via: 'answer',
        pack: 'generic',
        pack_version: 1,
        question: 'property',
        answer: 'home',
      },
    });
    expect(context.holdings.find((h) => h.id === ids.old)?.archived).toBe(true);
    expect(context.values).toHaveLength(6);
    expect(context.values[0]).toEqual({
      id: matching(/^val_/),
      holdingId: anyString,
      date: anyString,
      amountMinor: anyNumber,
      currency: anyString,
      baseMinor: anyNumber,
      source: 'agent',
      clientName: 'Claude',
      connectionId: connection,
    });
    expect(context.types).toHaveLength(13);
    expect(Object.keys(context.types[0] ?? {}).sort()).toEqual([
      'customName',
      'id',
      'packTypeKey',
      'universal',
    ]);
    expect(context.tags).toEqual([{ id: ids.tag, name: 'Long term' }]);
    expect(context.connections).toEqual([
      { id: connection, client: 'claude' },
      { id: ids.revoked, client: 'chatgpt' },
    ]);
  });

  it('compiles into a financial context that holds the schema', async () => {
    const context = await suite.as(userId).read((l) => l.context());
    const chain = await suite.content.forCountry('qz').chain();
    const compiled = compileContext(context, chain, '2026-08-01');
    expect(financialContextSchema.parse(compiled)).toEqual(compiled);
    expect(compiled.picture.holdings).toBe(4);
    expect(compiled.currency).toBe('USD');
  });
});

describe('listHoldings', () => {
  it('lists unarchived holdings with their type label, latest value and staleness', async () => {
    const page = await suite.as(userId).read((l) => l.listHoldings({}));
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((h) => h.id)).toEqual([ids.cash, ids.fund, ids.flat, ids.loan]);
    expect(page.items[0]).toMatchObject({
      universal: 'cash',
      typeLabel: 'Current account',
      latest: { date: '2026-07-31', amountMinor: 150_000 },
      // The country pack expects cash every 14 days; today is 2026-08-01.
      staleness: { stale: false, days: 1 },
    });
    expect(page.items[2]).toMatchObject({ staleness: { stale: false, days: 213 } });
  });

  it('filters by archived, type, tag, name and staleness', async () => {
    const read = (q: HoldingQuery) =>
      suite.as(userId).read(async (l) => (await l.listHoldings(q)).items.map((h) => h.id));
    expect(await read({ archived: 'only' })).toEqual([ids.old]);
    expect(await read({ archived: 'include' })).toHaveLength(5);
    expect(await read({ tagIds: [ids.tag!] })).toEqual([ids.fund]);
    const listed = await suite.typeId(userId, 'listed');
    expect(await read({ typeIds: [listed] })).toEqual([ids.fund]);
    expect(await read({ query: 'ACCOUNT' })).toEqual([ids.cash]);
    expect(await read({ query: 'account', archived: 'include' })).toEqual([ids.cash, ids.old]);
    expect(await read({ staleOnly: true })).toEqual([ids.loan]);
  });

  it('pages with an opaque cursor', async () => {
    const first = await suite.as(userId).read((l) => l.listHoldings({ limit: 3 }));
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toEqual(anyString);
    const second = await suite
      .as(userId)
      .read((l) => l.listHoldings({ limit: 3, cursor: first.nextCursor! }));
    expect(second.items.map((h) => h.id)).toEqual([ids.loan]);
    expect(second.nextCursor).toBeNull();
    const forged = Buffer.from('anything').toString('base64url');
    const bad = await appError(suite.as(userId).read((l) => l.listHoldings({ cursor: forged })));
    expect(bad).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { cursor: anyString } },
    });
  });

  it('is NOT_FOUND for a type or tag id that is not the user’s', async () => {
    const error = await appError(
      suite
        .as(userId)
        .read((l) => l.listHoldings({ typeIds: ['typ_nope'], tagIds: [ids.tag!, 'tag_nope'] })),
    );
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      details: { fields: { 'typeIds[0]': anyString, 'tagIds[1]': anyString } },
    });
  });
});

describe('getHolding', () => {
  it('gives the holding and its values newest first, paged', async () => {
    const detail = await suite.as(userId).read((l) => l.getHolding(ids.cash!, { limit: 1 }));
    expect(detail).toMatchObject({ id: ids.cash, latest: { date: '2026-07-31' } });
    expect(detail.values.items.map((v) => v.date)).toEqual(['2026-07-31']);
    const next = await suite
      .as(userId)
      .read((l) => l.getHolding(ids.cash!, { limit: 1, cursor: detail.values.nextCursor! }));
    expect(next.values).toEqual({
      items: [like({ date: '2026-05-31' })],
      nextCursor: null,
    });
    expect((await appError(suite.as(userId).read((l) => l.getHolding('hld_nope')))).code).toBe(
      'NOT_FOUND',
    );
    const bad = await appError(
      suite.as(userId).read((l) => l.getHolding(ids.cash!, { limit: 501 })),
    );
    expect(bad.details?.fields).toHaveProperty(['values.limit']);
  });
});

describe('history', () => {
  it('gives net worth per month from the stored conversions, archived holdings left out', async () => {
    const series = await suite
      .as(userId)
      .read((l) => l.history({ from: '2026-05-01', interval: 'month' }));
    expect(series).toMatchObject({ currency: 'USD', interval: 'month', groupBy: 'none' });
    expect(series.points.map((p) => [p.date, p.total])).toEqual([
      ['2026-05-31', 100_000 + 30_000_000 - 20_000_000],
      ['2026-06-30', 100_000 + 30_000_000 - 20_000_000],
      ['2026-07-31', 150_000 + 100_000 + 30_000_000 - 20_000_000],
      ['2026-08-01', 150_000 + 100_000 + 30_000_000 - 20_000_000],
    ]);
  });

  it('groups and filters', async () => {
    const listed = await suite.typeId(userId, 'listed');
    const byAccess = await suite
      .as(userId)
      .read((l) => l.history({ from: '2026-08-01', groupBy: 'access' }));
    expect(byAccess.points).toEqual([
      {
        date: '2026-08-01',
        total: 10_250_000,
        groups: { could_use: 250_000, locked: 30_000_000, owed: -20_000_000 },
        carried: true,
      },
    ]);
    const funds = await suite
      .as(userId)
      .read((l) => l.history({ from: '2026-07-01', typeIds: [listed] }));
    expect(funds.points.map((p) => p.total)).toEqual([100_000, 100_000]);
    const error = await appError(
      suite.as(userId).read((l) => l.history({ from: '2026-08-02', to: '2026-08-01' })),
    );
    expect(error.details?.fields).toHaveProperty('from');
  });
});

describe('periods', () => {
  it('gives each month newest first, from the stored conversions, archived holdings left out', async () => {
    const table = await suite.as(userId).read((l) => l.periods({ view: 'monthly' }));
    expect(table).toMatchObject({ currency: 'USD', view: 'monthly' });
    expect(table.periods.map((p) => [p.start, p.end, p.endValue])).toEqual([
      ['2026-08-01', '2026-08-01', 10_250_000],
      ['2026-07-01', '2026-07-31', 10_250_000],
      ['2026-06-01', '2026-06-30', 10_100_000],
      ['2026-05-01', '2026-05-31', 10_100_000],
      ['2026-04-01', '2026-04-30', 10_000_000],
      ['2026-03-01', '2026-03-31', 10_000_000],
      ['2026-02-01', '2026-02-28', 30_000_000],
      ['2026-01-01', '2026-01-31', 30_000_000],
      ['2025-12-01', '2025-12-31', 30_000_000],
    ]);
    expect(table.periods[1]).toMatchObject({
      change: 150_000,
      changePct: (150_000 / 10_100_000) * 100,
      carried: true,
    });
    expect(table.periods[1]?.drivers).toEqual([
      { holdingId: ids.fund, name: 'World fund', contribution: 100_000 },
      { holdingId: ids.cash, name: 'Everyday account', contribution: 50_000 },
    ]);
    expect(table.periods[5]).toMatchObject({ change: -20_000_000, carried: true });
    expect(table.periods.at(-1)).toMatchObject({
      change: 30_000_000,
      changePct: null,
      carried: false,
    });
  });

  it('pages the newest periods with each one’s top drivers', async () => {
    const table = await suite
      .as(userId)
      .read((l) => l.periods({ view: 'monthly', periods: 2, drivers: 1 }));
    expect(table.periods.map((p) => p.start)).toEqual(['2026-08-01', '2026-07-01']);
    expect(table.periods[1]?.drivers).toEqual([
      { holdingId: ids.fund, name: 'World fund', contribution: 100_000 },
    ]);
    const quarterly = await suite
      .as(userId)
      .read((l) => l.periods({ view: 'quarterly', periods: 1 }));
    expect(quarterly.periods.map((p) => [p.start, p.end])).toEqual([['2026-07-01', '2026-08-01']]);
  });

  it('names a bad view and counts outside 1 to 24 periods and 1 to 25 drivers', async () => {
    const view = await appError(
      suite.as(userId).read((l) => l.periods({ view: 'weekly' } as never)),
    );
    expect(view.details?.fields).toHaveProperty('view');
    const many = await appError(
      suite.as(userId).read((l) => l.periods({ view: 'monthly', periods: 25 })),
    );
    expect(many.details?.fields).toHaveProperty('periods');
    const none = await appError(
      suite.as(userId).read((l) => l.periods({ view: 'monthly', drivers: 0 })),
    );
    expect(none.details?.fields).toHaveProperty('drivers');
  });

  it('recomputes the affected periods when a value is back-dated', async () => {
    const newcomer = await suite.newUser('USD');
    const holdingId = (
      await suite
        .as(newcomer)
        .write((l) =>
          l.createHolding({ name: 'Side pot', kind: 'asset', universal: 'cash', currency: 'USD' }),
        )
    ).result.id;
    await suite
      .as(newcomer)
      .write((l) => l.recordValues([{ holdingId, amount: '1000', date: '2026-05-31' }]));
    const before = await suite.as(newcomer).read((l) => l.periods({ view: 'monthly' }));
    expect(before.periods.map((p) => [p.start, p.endValue])).toEqual([
      ['2026-08-01', 100_000],
      ['2026-07-01', 100_000],
      ['2026-06-01', 100_000],
      ['2026-05-01', 100_000],
    ]);
    await suite
      .as(newcomer)
      .write((l) => l.recordValues([{ holdingId, amount: '1200', date: '2026-06-15' }]));
    const after = await suite.as(newcomer).read((l) => l.periods({ view: 'monthly' }));
    expect(after.periods.map((p) => [p.start, p.endValue, p.carried])).toEqual([
      ['2026-08-01', 120_000, true],
      ['2026-07-01', 120_000, true],
      ['2026-06-01', 120_000, false],
      ['2026-05-01', 100_000, false],
    ]);
    expect(after.periods[2]).toMatchObject({ change: 20_000 });
  });
});
