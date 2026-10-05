import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, anyString, containing, like } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  onboarded,
  send,
  snapshotOf,
  typeIdOf,
  unknownId,
  type LedgerApp,
  type Person,
  type WriteBody,
} from './support';

/**
 * A holding's values (architecture §7.2): `GET` and `POST /api/holdings/:id/values`, `PATCH` and
 * `DELETE /api/values/:id`, each with its happy path, a validation error naming the fields, and
 * not-found. The suite's clock is 2026-08-01T10:00Z.
 */
let db: TestDatabase;
let target: LedgerApp;
let p: Person;
let cashType: string;

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  p = await onboarded(target);
  cashType = await typeIdOf(p, 'cash');
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

interface ValueBody {
  id: string;
  holdingId: string;
  date: string;
  amountMinor: number;
  currency: string;
  baseMinor: number;
  source: string;
}

let holdings = 0;

async function newHolding(): Promise<string> {
  holdings += 1;
  const res = await p.post('/api/holdings', {
    name: `Pot ${holdings}`,
    kind: 'asset',
    typeId: cashType,
    currency: 'EUR',
    via: 'form',
    allowDuplicate: true,
  });
  return (await json<WriteBody<{ id: string }>>(res)).result.id;
}

async function record(holdingId: string, body: unknown) {
  return json<WriteBody<ValueBody>>(await p.post(`/api/holdings/${holdingId}/values`, body));
}

describe('POST /api/holdings/:id/values', () => {
  it('records a value; the result is the value as stored', async () => {
    const holdingId = await newHolding();
    const body = await record(holdingId, { amount: '2000.50', date: '2026-07-31' });
    expect(body).toStrictEqual({
      result: like({
        holdingId,
        date: '2026-07-31',
        amountMinor: 200050,
        currency: 'EUR',
        baseMinor: 200050,
        source: 'web',
      }),
      dataVersion: (await snapshotOf(p)).dataVersion,
      warnings: [],
    });
  });

  it('replaces a value for the same date, with SAME_DATE_REPLACED', async () => {
    const holdingId = await newHolding();
    const first = await record(holdingId, { amount: 100, date: '2026-07-15' });
    const second = await record(holdingId, { amount: 125, date: '2026-07-15' });
    expect(second.result).toMatchObject({ id: first.result.id, amountMinor: 12500 });
    expect(second.warnings).toStrictEqual([
      { code: 'SAME_DATE_REPLACED', message: containing('2026-07-15') },
    ]);
  });

  it('dates a value without one today, in the person’s time zone', async () => {
    const holdingId = await newHolding();
    expect((await record(holdingId, { amount: 1 })).result.date).toBe('2026-08-01');
    // 10:00 UTC is already the next day at UTC+14.
    await json(await p.patch('/api/me', { timeZone: 'Pacific/Kiritimati' }));
    expect((await record(holdingId, { amount: 2 })).result.date).toBe('2026-08-02');
    await json(await p.patch('/api/me', { timeZone: 'UTC' }));
  });

  it('names each bad field as the body names it', async () => {
    const holdingId = await newHolding();
    const cases: [unknown, string, string][] = [
      [{}, 'amount', 'VALIDATION_FAILED'],
      [{ amount: true }, 'amount', 'VALIDATION_FAILED'],
      [{ amount: '12', date: '2026-02-30' }, 'date', 'VALIDATION_FAILED'],
      [{ amount: '12', holdingId }, 'holdingId', 'VALIDATION_FAILED'],
      [{ amount: '12', note: 'x' }, 'note', 'VALIDATION_FAILED'],
      [{ amount: '1.234' }, 'amount', 'OUT_OF_RANGE'],
      [{ amount: '12', date: '2026-09-30' }, 'date', 'OUT_OF_RANGE'],
      [{ amount: '12', currency: 'XYZ' }, 'currency', 'CURRENCY_UNSUPPORTED'],
      ['nope', 'body', 'VALIDATION_FAILED'],
    ];
    for (const [body, field, code] of cases) {
      const error = await errorOf(await p.post(`/api/holdings/${holdingId}/values`, body), 400);
      expect(error, JSON.stringify(body)).toMatchObject({ code });
      expect(Object.keys(error.fields ?? {}), JSON.stringify(body)).toStrictEqual([field]);
      expect(error.message).not.toContain('values[0]');
    }
    expect(
      await errorOf(await p.post('/api/holdings/hld_nope/values', { amount: 1 }), 400),
    ).toMatchObject({ fields: { id: anyString } });
  });

  it('answers NOT_FOUND for a holding that is not there', async () => {
    const error = await errorOf(
      await p.post(`/api/holdings/${unknownId('hld')}/values`, { amount: 1 }),
      404,
    );
    expect(error).toStrictEqual({
      code: 'NOT_FOUND',
      message: `There is no holding "${unknownId('hld')}" in this account.`,
    });
  });

  it('needs a session', async () => {
    const res = await send(target, null, 'POST', `/api/holdings/${unknownId('hld')}/values`, {
      json: { amount: 1 },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/holdings/:id/values', () => {
  it('pages a holding’s values, newest first', async () => {
    const holdingId = await newHolding();
    for (const date of ['2026-05-31', '2026-06-30', '2026-07-31']) {
      await record(holdingId, { amount: 10, date });
    }
    const first = await json<{ items: ValueBody[]; nextCursor: string | null }>(
      await p.get(`/api/holdings/${holdingId}/values?limit=2`),
    );
    expect(first.items.map((v) => v.date)).toStrictEqual(['2026-07-31', '2026-06-30']);
    expect(first.nextCursor).toEqual(anyString);
    const rest = await json<{ items: ValueBody[]; nextCursor: string | null }>(
      await p.get(
        `/api/holdings/${holdingId}/values?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      ),
    );
    expect(rest).toStrictEqual({
      items: [like({ date: '2026-05-31' })],
      nextCursor: null,
    });
    const all = await json<{ items: ValueBody[] }>(
      await p.get(`/api/holdings/${holdingId}/values`),
    );
    expect(all.items).toHaveLength(3);
  });

  it('names a bad limit or cursor', async () => {
    const holdingId = await newHolding();
    for (const query of ['limit=0', 'limit=201', 'limit=abc', 'limit=1.5', 'limit=']) {
      const error = await errorOf(await p.get(`/api/holdings/${holdingId}/values?${query}`), 400);
      expect(error.fields, query).toStrictEqual({ limit: anyString });
    }
    await json(await p.get(`/api/holdings/${holdingId}/values?limit=200`));
    const error = await errorOf(
      await p.get(`/api/holdings/${holdingId}/values?cursor=garbage`),
      400,
    );
    expect(error.fields).toStrictEqual({ cursor: anyString });
    expect(await errorOf(await p.get('/api/holdings/x/values'), 400)).toMatchObject({
      fields: { id: anyString },
    });
  });

  it('answers NOT_FOUND for a holding that is not there', async () => {
    expect(
      await errorOf(await p.get(`/api/holdings/${unknownId('hld')}/values`), 404),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('PATCH /api/values/:id', () => {
  it('corrects a value', async () => {
    const holdingId = await newHolding();
    const { result: made } = await record(holdingId, { amount: '40', date: '2026-07-20' });
    const body = await json<WriteBody<ValueBody>>(
      await p.patch(`/api/values/${made.id}`, { amount: '45.5', date: '2026-07-21' }),
    );
    expect(body.result).toMatchObject({ id: made.id, amountMinor: 4550, date: '2026-07-21' });
    expect(body.warnings).toStrictEqual([]);
  });

  it('names each bad field, and a malformed id', async () => {
    const holdingId = await newHolding();
    const { result: made } = await record(holdingId, { amount: '40', date: '2026-07-20' });
    const cases: [unknown, string][] = [
      [{ amount: false }, 'amount'],
      [{ fxRate: '-1' }, 'fxRate'],
      [{ date: 'yesterday' }, 'date'],
      [{ holdingId }, 'holdingId'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.patch(`/api/values/${made.id}`, body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
    expect(
      await errorOf(await p.patch(`/api/values/${holdingId}`, { amount: 1 }), 400),
    ).toMatchObject({ fields: { id: anyString } });
  });

  it('answers NOT_FOUND for a value that is not there', async () => {
    expect(
      await errorOf(await p.patch(`/api/values/${unknownId('val')}`, { amount: 1 }), 404),
    ).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('DELETE /api/values/:id', () => {
  it('deletes a value; the result is null', async () => {
    const holdingId = await newHolding();
    const { result: made } = await record(holdingId, { amount: '40', date: '2026-07-20' });
    const body = await json<WriteBody<null>>(await p.delete(`/api/values/${made.id}`));
    expect(body).toStrictEqual({ result: null, dataVersion: anyNumber, warnings: [] });
    expect((await snapshotOf(p)).values).toMatchObject({ [holdingId]: [] });
  });

  it('refuses a malformed id, and answers NOT_FOUND for one that is not there', async () => {
    expect(await errorOf(await p.delete('/api/values/val_'), 400)).toMatchObject({
      fields: { id: anyString },
    });
    expect(await errorOf(await p.delete(`/api/values/${unknownId('val')}`), 404)).toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
