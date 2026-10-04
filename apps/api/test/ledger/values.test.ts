import { latestValues } from '@netnet/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  appError,
  auditRows,
  containing,
  dataVersion,
  ledgerSuite,
  like,
  matching,
  RATE_DATE,
  rowCounts,
  USER,
  type LedgerSuite,
} from './support';

/** Values (PRD J3, J6; architecture §6.6, §7.4): recording, same-date replacement, FX, corrections. */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function userWithHolding(currency = 'USD', baseCurrency = 'USD') {
  const userId = await suite.newUser(baseCurrency);
  const created = await suite
    .as(userId)
    .write((l) => l.createHolding({ name: 'Account', kind: 'asset', universal: 'cash', currency }));
  return { userId, holdingId: created.result.id };
}

describe('recordValues', () => {
  it('writes every item, defaults currency and date, and fires value_recorded for each', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const connection = await suite.connect(userId);
    const write = await suite.as(userId, agentActor(connection, 'Claude')).write((l) =>
      l.recordValues([
        { holdingId, amount: '100.10', date: '2026-06-30' },
        { holdingId, amount: 200.2 },
      ]),
    );
    expect(
      write.result.map((r) => [r.value.date, r.value.amountMinor, r.value.currency, r.replaced]),
    ).toEqual([
      ['2026-06-30', 10_010, 'USD', false],
      ['2026-08-01', 20_020, 'USD', false],
    ]);
    expect(write.result[0]?.value).toMatchObject({
      source: 'agent',
      clientName: 'Claude',
      connectionId: connection,
      batchId: matching(/^bat_/),
      enteredAt: suite.clock.now().toISOString(),
    });
    expect(write.warnings).toEqual([]);
    expect(write.events).toEqual([
      { name: 'value_recorded', props: { source: 'agent' } },
      { name: 'value_recorded', props: { source: 'agent' } },
    ]);
  });

  it('converts at the rate for the value’s date and stores it, through USD, rounding half away from zero', async () => {
    const { userId, holdingId } = await userWithHolding('EUR', 'GBP');
    const write = await suite.as(userId).write((l) =>
      l.recordValues([
        { holdingId, amount: '100.01', date: '2026-07-31' },
        { holdingId, amount: '10', currency: 'JPY', date: '2026-07-30' },
        { holdingId, amount: '1.001', currency: 'KWD', date: '2026-06-01' },
        { holdingId, amount: '50', currency: 'GBP', date: '2026-07-29' },
      ]),
    );
    const values = write.result.map((r) => r.value);
    // EUR → GBP: 0.75 / 0.8 = 0.9375; 10001 × 0.9375 = 9375.9375 → 9376.
    expect(values[0]).toMatchObject({
      baseMinor: 9376,
      baseCurrency: 'GBP',
      fxRate: '0.9375',
      fxRateDate: RATE_DATE,
      fxSource: 'ecb',
    });
    // JPY (no decimals) → GBP: 10 × 0.005 = 0.05 GBP = 5 pence.
    expect(values[1]).toMatchObject({
      amountMinor: 10,
      baseMinor: 5,
      fxRate: '0.005',
      fxSource: 'ecb',
    });
    // Before the rates begin, the nearest later rate is used, and its date stored.
    expect(values[2]).toMatchObject({ amountMinor: 1001, fxRate: '2.5', fxRateDate: RATE_DATE });
    expect(values[2]?.baseMinor).toBe(250); // 1.001 KWD × 2.5 = 2.5025 GBP → 250 pence.
    expect(values[3]).toMatchObject({
      baseMinor: 5000,
      fxRate: '1',
      fxRateDate: null,
      fxSource: 'same',
    });
  });

  it('takes a rate the caller gives: user from the web, agent from an agent', async () => {
    const { userId, holdingId } = await userWithHolding('EUR', 'USD');
    const connection = await suite.connect(userId);
    const web = await suite
      .as(userId)
      .write((l) =>
        l.recordValues([{ holdingId, amount: '200', date: '2026-07-01', fxRate: '1.1' }]),
      );
    expect(web.result[0]?.value).toMatchObject({
      baseMinor: 22_000,
      fxRate: '1.1',
      fxSource: 'user',
      fxRateDate: '2026-07-01',
    });
    const agent = await suite
      .as(userId, agentActor(connection))
      .write((l) =>
        l.recordValues([{ holdingId, amount: '200', date: '2026-07-02', fxRate: 1.2 }]),
      );
    expect(agent.result[0]?.value).toMatchObject({
      baseMinor: 24_000,
      fxRate: '1.2',
      fxSource: 'agent',
    });
    const error = await appError(
      suite
        .as(userId)
        .write((l) => l.recordValues([{ holdingId, amount: '1', currency: 'USD', fxRate: '2' }])),
    );
    expect(error.details?.fields).toHaveProperty(['values[0].fxRate']);
  });

  it('replaces a value on the same date with SAME_DATE_REPLACED, and the latest by date drives the totals', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const first = await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId, amount: '100', date: '2026-07-31' }]));
    const firstId = first.result[0]!.value.id;
    suite.clock.advance(3 * 86_400_000);
    const second = await suite.as(userId).write((l) =>
      l.recordValues([
        { holdingId, amount: '120', date: '2026-07-31' },
        { holdingId, amount: '90', date: '2026-07-01' },
      ]),
    );
    expect(second.result[0]).toMatchObject({
      replaced: true,
      value: { id: firstId, amountMinor: 12_000, rowVersion: 2 },
    });
    expect(second.warnings).toEqual([like({ code: 'SAME_DATE_REPLACED', path: 'values[0]' })]);
    expect(second.result[0]?.warnings).toEqual(second.warnings);
    expect(second.events).toEqual([
      { name: 'value_corrected', props: { original_source: 'web', age_at_correction: 3 } },
      { name: 'value_recorded', props: { source: 'web' } },
    ]);
    const audits = (await auditRows(suite, userId)).slice(-2);
    expect(audits[0]).toMatchObject({
      entity: 'value',
      entity_id: firstId,
      action: 'update',
      before: { amountMinor: 10_000 },
      after: { amountMinor: 12_000 },
    });

    // A back-dated value never outranks a later-dated one, whatever order they were entered in.
    const snapshot = await suite.as(userId).read((l) => l.snapshot());
    expect(snapshot.values[holdingId]?.map((v) => [v[0], v[1]])).toEqual([
      ['2026-07-01', 9000],
      ['2026-07-31', 12_000],
    ]);
    const context = await suite.as(userId).read((l) => l.context());
    expect(latestValues(context.values, '2026-08-04').get(holdingId)).toMatchObject({
      date: '2026-07-31',
      baseMinor: 12_000,
    });
    suite.clock.set(new Date(Date.UTC(2026, 7, 1, 10)));
  });

  it('keeps the later of two items for one holding and date, and warns on the earlier', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const write = await suite.as(userId).write((l) =>
      l.recordValues([
        { holdingId, amount: '1', date: '2026-07-31' },
        { holdingId, amount: '2', date: '2026-07-30' },
        { holdingId, amount: '3', date: '2026-07-31' },
      ]),
    );
    expect(write.result.map((r) => [r.value.amountMinor, r.replaced, r.warnings.length])).toEqual([
      [300, false, 1],
      [200, false, 0],
      [300, false, 0],
    ]);
    expect(write.result[0]?.value.id).toBe(write.result[2]?.value.id);
    expect(write.warnings).toEqual([
      like({
        code: 'SAME_DATE_REPLACED',
        path: 'values[0]',
        message: containing('values[2]'),
      }),
    ]);
    const [count] = await suite.rows<{ n: number }>(
      'select count(*)::int as n from ledger.value where user_id = $1 and holding_id = $2',
      [userId, holdingId],
    );
    expect(count?.n).toBe(2);
    expect(write.events).toHaveLength(2);
  });

  it('writes nothing when one item fails, and names every bad item and field', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const counts = await rowCounts(suite, userId);
    const version = await dataVersion(suite, userId);
    const items = Array.from({ length: 10 }, (_, i) => ({
      holdingId,
      amount: `${i + 1}`,
      date: `2026-07-${String(i + 10)}`,
    }));
    const error = await appError(
      suite
        .as(userId)
        .write((l) =>
          l.recordValues([
            ...items,
            { holdingId, amount: '1.005', date: '2026-07-01' },
            { holdingId: 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZ', amount: '1' },
            { holdingId, amount: '1', date: '2026-08-03' },
            { holdingId, amount: '1', currency: 'XAU' },
          ]),
        ),
    );
    expect(error.code).toBe('OUT_OF_RANGE');
    expect(error.details?.fields).toEqual({
      'values[10].amount': containing('2 decimal places'),
      'values[11].holdingId': containing('no holding'),
      'values[12].date': containing('2026-08-02'),
      'values[13].currency': anyString,
    });
    expect(error.message).toMatch(/^values\[10\]\.amount: /);
    expect(await rowCounts(suite, userId)).toEqual(counts);
    expect(await dataVersion(suite, userId)).toBe(version);
  });

  it('writes nothing when the last item’s currency has no rates', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const counts = await rowCounts(suite, userId);
    const error = await appError(
      suite.as(userId).write((l) =>
        l.recordValues([
          { holdingId, amount: '1', date: '2026-07-01' },
          { holdingId, amount: '1', currency: 'CHF', date: '2026-07-02' },
        ]),
      ),
    );
    expect(error).toMatchObject({
      code: 'CURRENCY_UNSUPPORTED',
      details: { fields: { 'values[1].currency': anyString } },
    });
    expect(await rowCounts(suite, userId)).toEqual(counts);
  });

  it.each([
    ['no items', [], 'values'],
    ['201 items', Array.from({ length: 201 }, () => ({ amount: 1 })), 'values'],
    ['an amount that is not a number', [{ amount: 'ten' }], 'values[0].amount'],
    ['an amount with separators', [{ amount: '1,000' }], 'values[0].amount'],
    ['a date that is not a date', [{ amount: 1, date: '2026-02-30' }], 'values[0].date'],
    ['a negative rate', [{ amount: 1, fxRate: '-1' }], 'values[0].fxRate'],
    ['an unknown field', [{ amount: 1, note: 'x' }], 'values[0].note'],
  ])('rejects %s', async (_, items, path) => {
    const { userId, holdingId } = await userWithHolding('USD');
    const error = await appError(
      suite
        .as(userId)
        .write((l) => l.recordValues(items.map((i) => ({ holdingId, ...i })) as never)),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.fields).toHaveProperty([path]);
  });

  it('accepts 200 items in one call', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const items = Array.from({ length: 200 }, (_, i) => ({
      holdingId,
      amount: i,
      date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    }));
    const write = await suite.as(userId).write((l) => l.recordValues(items));
    expect(write.result).toHaveLength(200);
    expect((await auditRows(suite, userId)).filter((a) => a.entity === 'value')).toHaveLength(200);
  });

  it('rejects amounts beyond 10^15 minor units, before and after conversion', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const tooBig = await appError(
      suite.as(userId).write((l) => l.recordValues([{ holdingId, amount: '10000000000000.01' }])),
    );
    expect(tooBig).toMatchObject({
      code: 'OUT_OF_RANGE',
      details: { fields: { 'values[0].amount': anyString } },
    });
    const converted = await appError(
      suite.as(userId).write((l) =>
        l.recordValues([
          { holdingId, amount: '9000000000000', currency: 'USD', date: '2026-07-01' },
          { holdingId, amount: '9000000000000', currency: 'EUR', fxRate: '1000' },
        ]),
      ),
    );
    expect(converted.details?.fields).toHaveProperty(['values[1].amount']);
  });
});

describe('updateValue', () => {
  it('corrects the amount at the stored rate, takes the corrector’s provenance, and fires value_corrected', async () => {
    const { userId, holdingId } = await userWithHolding('EUR', 'USD');
    const connection = await suite.connect(userId);
    const recorded = await suite
      .as(userId, agentActor(connection))
      .write((l) => l.recordValues([{ holdingId, amount: '100', date: '2026-07-31' }]));
    const original = recorded.result[0]!.value;
    expect(original).toMatchObject({ fxRate: '1.25', fxSource: 'ecb', baseMinor: 12_500 });
    suite.clock.advance(2 * 86_400_000);
    const lookups = suite.rates.lookups;
    const write = await suite.as(userId).write((l) => l.updateValue(original.id, { amount: '80' }));
    expect(suite.rates.lookups).toBe(lookups);
    expect(write.result).toMatchObject({
      amountMinor: 8000,
      baseMinor: 10_000,
      fxRate: '1.25',
      fxRateDate: RATE_DATE,
      fxSource: 'ecb',
      source: 'web',
      clientName: null,
      connectionId: null,
      batchId: null,
      enteredAt: original.enteredAt,
      rowVersion: 2,
    });
    expect(write.events).toEqual([
      { name: 'value_corrected', props: { original_source: 'agent', age_at_correction: 2 } },
    ]);
    const [audit] = (await auditRows(suite, userId)).slice(-1);
    expect(audit).toMatchObject({
      entity: 'value',
      action: 'update',
      before: original,
      after: write.result,
    });
    suite.clock.set(new Date(Date.UTC(2026, 7, 1, 10)));
  });

  it('looks the rate up again for a new currency, and keeps a given rate until it is dropped', async () => {
    const { userId, holdingId } = await userWithHolding('USD', 'USD');
    const recorded = await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId, amount: '100', date: '2026-07-31' }]));
    const id = recorded.result[0]!.value.id;
    const eur = await suite.as(userId).write((l) => l.updateValue(id, { currency: 'EUR' }));
    expect(eur.result).toMatchObject({
      amountMinor: 10_000,
      currency: 'EUR',
      fxRate: '1.25',
      fxSource: 'ecb',
      baseMinor: 12_500,
    });
    const given = await suite.as(userId).write((l) => l.updateValue(id, { fxRate: '1.5' }));
    expect(given.result).toMatchObject({ fxRate: '1.5', fxSource: 'user', baseMinor: 15_000 });
    expect(given.events).toEqual([]);
    const moved = await suite
      .as(userId)
      .write((l) => l.updateValue(id, { date: '2026-07-20', amount: '10.50' }));
    expect(moved.result).toMatchObject({
      fxRate: '1.5',
      fxSource: 'user',
      fxRateDate: '2026-07-20',
      baseMinor: 1575,
    });
    const dropped = await suite.as(userId).write((l) => l.updateValue(id, { fxRate: null }));
    // 1050 × 1.25 = 1312.5, rounded half away from zero.
    expect(dropped.result).toMatchObject({ fxRate: '1.25', fxSource: 'ecb', baseMinor: 1313 });
    const jpy = await appError(
      suite.as(userId).write((l) => l.updateValue(id, { currency: 'JPY' })),
    );
    expect(jpy).toMatchObject({
      code: 'OUT_OF_RANGE',
      details: { fields: { amount: containing('JPY') } },
    });
    const back = await suite.as(userId).write((l) => l.updateValue(id, { currency: 'USD' }));
    expect(back.result).toMatchObject({
      fxRate: '1',
      fxSource: 'same',
      fxRateDate: null,
      baseMinor: 1050,
    });
  });

  it('replaces the value on the date it moves to, with a warning, and writes nothing for no change', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const recorded = await suite.as(userId).write((l) =>
      l.recordValues([
        { holdingId, amount: '1', date: '2026-07-01' },
        { holdingId, amount: '2', date: '2026-07-02' },
      ]),
    );
    const [a, b] = recorded.result.map((r) => r.value);
    const write = await suite.as(userId).write((l) => l.updateValue(a!.id, { date: '2026-07-02' }));
    expect(write.warnings).toEqual([
      like({
        code: 'SAME_DATE_REPLACED',
        message: containing(b!.id),
      }),
    ]);
    const audits = (await auditRows(suite, userId)).slice(-2);
    expect(audits.map((x) => [x.entity_id, x.action])).toEqual([
      [b!.id, 'delete'],
      [a!.id, 'update'],
    ]);
    const version = await dataVersion(suite, userId);
    const same = await suite.as(userId).write((l) => l.updateValue(a!.id, { amount: '1.00' }));
    expect(same.dataVersion).toBe(version);
    expect(same.events).toEqual([]);
  });

  it('is NOT_FOUND for an unknown value, and checks the date', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    expect(
      (await appError(suite.as(userId).write((l) => l.updateValue('val_nope', { amount: 1 }))))
        .code,
    ).toBe('NOT_FOUND');
    const recorded = await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId, amount: '1' }]));
    const error = await appError(
      suite
        .as(userId)
        .write((l) => l.updateValue(recorded.result[0]!.value.id, { date: '2027-01-01' })),
    );
    expect(error).toMatchObject({
      code: 'OUT_OF_RANGE',
      details: { fields: { date: anyString } },
    });
  });
});

describe('deleteValue', () => {
  it('deletes the value with its audit row', async () => {
    const { userId, holdingId } = await userWithHolding('USD');
    const recorded = await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId, amount: '1' }]));
    const value = recorded.result[0]!.value;
    const write = await suite.as(userId, USER).write((l) => l.deleteValue(value.id));
    expect(write.result).toBeUndefined();
    expect((await auditRows(suite, userId)).at(-1)).toMatchObject({
      entity: 'value',
      action: 'delete',
      before: value,
      after: null,
    });
    expect((await appError(suite.as(userId).write((l) => l.deleteValue(value.id)))).code).toBe(
      'NOT_FOUND',
    );
  });
});
