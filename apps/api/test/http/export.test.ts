import { EXPORT_CSV_HEADER, type ExportBundle } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  errorOf,
  json,
  ledgerApp,
  newPerson,
  onboarded,
  send,
  typeIdOf,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * `GET /api/export` (architecture §7.2, PRD J10): the full bundle as JSON, one flat values table
 * as CSV. Both rebuild the position: every holding and value with its currency, rate and rate
 * date. All data is fictional (CONVENTIONS §6).
 */
let db: TestDatabase;
let target: LedgerApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

let holdings = 0;

/** A holding with a tag and two values, one at the statement's own rate. */
async function stockedHolding(p: Person, name: string): Promise<string> {
  holdings += 1;
  const cash = await typeIdOf(p, 'cash');
  const tag = await json<WriteBody<{ id: string }>>(
    await p.post('/api/tags', { name: `Pot tag ${holdings}` }),
  );
  const holding = await json<WriteBody<{ id: string }>>(
    await p.post('/api/holdings', {
      name,
      kind: 'asset',
      typeId: cash,
      currency: 'USD',
      tagIds: [tag.result.id],
      via: 'form',
    }),
  );
  const id = holding.result.id;
  await json(await p.post(`/api/holdings/${id}/values`, { amount: '100', date: '2026-07-01' }));
  await json(
    await p.post(`/api/holdings/${id}/values`, {
      amount: '200',
      date: '2026-07-15',
      fxRate: '0.81',
    }),
  );
  return id;
}

describe('GET /api/export', () => {
  it('needs a session, and is never cached', async () => {
    const res = await send(target, null, 'GET', '/api/export?format=csv');
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('refuses an unknown format, naming it', async () => {
    const p = await onboarded(target);
    const error = await errorOf(await p.get('/api/export?format=xml'), 400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.fields).toStrictEqual({ format: 'Send "json" or "csv", or leave it out.' });
  });

  it('is empty before the ledger exists, in both formats', async () => {
    const p = await newPerson(target);
    const bundle = await json<ExportBundle>(await p.get('/api/export'));
    expect(bundle).toMatchObject({
      baseCurrency: null,
      dataVersion: null,
      types: [],
      tags: [],
      holdings: [],
      values: [],
    });
    const csv = await p.get('/api/export?format=csv');
    expect(csv.headers.get('Content-Type')).toContain('text/csv');
    expect(await csv.text()).toBe(`${EXPORT_CSV_HEADER}\n`);
  });

  it('exports everything as JSON: holdings, types, tags, values, rates and rate dates', async () => {
    const p = await onboarded(target);
    const id = await stockedHolding(p, 'Rainy day pot');
    const bundle = await json<ExportBundle>(await p.get('/api/export?format=json'));
    expect(bundle.baseCurrency).toBe('EUR');
    expect(bundle.dataVersion).toBeGreaterThan(0);
    expect(bundle.holdings.map((h) => h.name)).toContain('Rainy day pot');
    const holding = bundle.holdings.find((h) => h.id === id)!;
    expect(holding.access).toBe('accessible');
    expect(holding.accessBasis).toMatchObject({ via: 'default', pack: 'generic' });
    expect(holding.tagIds).toHaveLength(1);
    expect(bundle.tags).toHaveLength(1);
    expect(bundle.types.find((t) => t.id === holding.typeId)?.label).toBe('Current account');

    const values = bundle.values.filter((v) => v.holdingId === id);
    expect(values.map((v) => v.date)).toStrictEqual(['2026-07-01', '2026-07-15']);
    expect(values[0]).toMatchObject({
      amountMinor: 10000,
      currency: 'USD',
      baseCurrency: 'EUR',
      fxRateDate: '2026-07-01',
      fxSource: 'ecb',
      source: 'web',
    });
    expect(values[0]!.baseMinor).toBeGreaterThan(0);
    expect(values[0]).toMatchObject({ givenRate: null, givenRateInto: null });
    expect(values[1]).toMatchObject({
      amountMinor: 20000,
      fxRate: '0.81',
      fxSource: 'user',
      givenRate: '0.81',
      givenRateInto: 'EUR',
    });
  });

  it('exports one flat values table as CSV, under the documented header', async () => {
    const p = await onboarded(target);
    const id = await stockedHolding(p, 'Rainy day pot');
    const res = await p.get('/api/export?format=csv');
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const lines = (await res.text()).split('\n');
    expect(lines[0]).toBe(EXPORT_CSV_HEADER);
    const rows = lines.slice(1, -1);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.split(',')).toHaveLength(19);
    const cells = rows.map((row) => row.split(','));
    // holding_id,holding_name,kind,type,currency,date,amount,base_amount,base_currency,…
    expect(cells[0]!.slice(0, 7)).toStrictEqual([
      id,
      'Rainy day pot',
      'asset',
      'Current account',
      'USD',
      '2026-07-01',
      '100.00',
    ]);
    expect(cells[0]!.slice(8, 13)).toStrictEqual(['EUR', cells[0]![9], '2026-07-01', 'ecb', 'web']);
    expect(Number(cells[0]![7])).toBeGreaterThan(0);
    expect(cells[0]!.slice(13)).toStrictEqual([
      '',
      'accessible',
      'it is money in the bank',
      expect.stringContaining('Pot tag'),
      '',
      '',
    ]);
    expect(cells[1]!.slice(5, 7)).toStrictEqual(['2026-07-15', '200.00']);
    expect(cells[1]!.slice(9, 12)).toStrictEqual(['0.81', '2026-07-15', 'user']);
    // given_rate,given_rate_into: the statement's rate as given, into the default currency.
    expect(cells[1]!.slice(17)).toStrictEqual(['0.81', 'EUR']);
  });

  it('exports only the caller’s own data, in both formats', async () => {
    const a = await onboarded(target);
    const b = await onboarded(target);
    await stockedHolding(a, 'Avery’s rainy day pot');
    await stockedHolding(b, 'Berlin’s rainy day pot');
    const bundle = await json<ExportBundle>(await b.get('/api/export'));
    const text = JSON.stringify(bundle);
    expect(text).toContain('Berlin’s rainy day pot');
    expect(text).not.toContain('Avery’s rainy day pot');
    const csv = await (await b.get('/api/export?format=csv')).text();
    expect(csv).toContain('Berlin’s rainy day pot');
    expect(csv).not.toContain('Avery’s rainy day pot');
  });
});
