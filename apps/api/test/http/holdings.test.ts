import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyNumber, anyString, like } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  newPerson,
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
 * `POST /api/holdings`, `PATCH` and `DELETE /api/holdings/:id` (architecture §7.2): each route's
 * happy path, a validation error naming the fields, and not-found. Isolation is in
 * isolation.test.ts, events in events.test.ts.
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

interface HoldingBody {
  id: string;
  name: string;
  kind: string;
  typeId: string;
  currency: string;
  archived: boolean;
  tagIds: string[];
  access: string | null;
}

async function create(body: Record<string, unknown>): Promise<WriteBody<HoldingBody>> {
  return json<WriteBody<HoldingBody>>(await p.post('/api/holdings', body));
}

describe('POST /api/holdings', () => {
  it('creates a holding with its opening value, uncached', async () => {
    const before = (await snapshotOf(p)).dataVersion;
    const res = await p.post('/api/holdings', {
      name: 'Rainy day pot',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      opening: { amount: '1500.25', date: '2026-07-31' },
      via: 'form',
    });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await json<WriteBody<HoldingBody>>(res);
    expect(body).toStrictEqual({
      result: like({
        name: 'Rainy day pot',
        kind: 'asset',
        typeId: cashType,
        currency: 'EUR',
        archived: false,
        tagIds: [],
        access: 'accessible',
      }),
      dataVersion: before + 1,
      warnings: [],
    });
    const snapshot = await snapshotOf(p);
    expect(snapshot.values).toMatchObject({
      [body.result.id]: [['2026-07-31', 150025, 'EUR', 150025, 'web', null, anyString]],
    });
  });

  it('takes universal in place of typeId (the Ledger’s own input)', async () => {
    const { result } = await create({
      name: 'Old banger',
      kind: 'asset',
      universal: 'vehicle',
      currency: 'EUR',
      via: 'guided',
    });
    expect(result.typeId).toBe(await typeIdOf(p, 'vehicle'));
  });

  it('names each bad field, and requires via', async () => {
    expect(await errorOf(await p.post('/api/holdings', {}), 400)).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: {
        name: anyString,
        kind: anyString,
        currency: anyString,
        via: anyString,
      },
    });
    const cases: [unknown, string][] = [
      [{ name: 'Pot', kind: 'asset', currency: 'EUR', via: 'form' }, 'typeId'],
      [{ name: 'Pot', kind: 'asset', typeId: cashType, currency: 'EUR' }, 'via'],
      [{ name: 'Pot', kind: 'asset', typeId: cashType, currency: 'EUR', via: 'wizard' }, 'via'],
      [{ name: ' ', kind: 'asset', typeId: cashType, currency: 'EUR', via: 'form' }, 'name'],
      [{ name: 'Pot', kind: 'gift', typeId: cashType, currency: 'EUR', via: 'form' }, 'kind'],
      [{ name: 'Pot', kind: 'asset', typeId: cashType, currency: 'EURO', via: 'form' }, 'currency'],
      [
        { name: 'Pot', kind: 'asset', typeId: cashType, currency: 'EUR', via: 'form', userId: 'x' },
        'userId',
      ],
      [
        {
          name: 'Pot',
          kind: 'asset',
          typeId: cashType,
          currency: 'EUR',
          via: 'form',
          opening: { amount: '5', date: '2026-02-30' },
        },
        'opening.date',
      ],
      [[], 'body'],
      ['not json', 'body'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.post('/api/holdings', body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
  });

  it('refuses accessibility for a liability, and an unknown currency', async () => {
    const loan = await p.post('/api/holdings', {
      name: 'Car loan',
      kind: 'liability',
      universal: 'loan',
      currency: 'EUR',
      access: 'not_sure',
      via: 'form',
    });
    expect(await errorOf(loan, 400)).toMatchObject({ fields: { access: anyString } });
    const money = await p.post('/api/holdings', {
      name: 'Doubloons',
      kind: 'asset',
      typeId: cashType,
      currency: 'XYZ',
      via: 'form',
    });
    expect(await errorOf(money, 400)).toMatchObject({
      code: 'CURRENCY_UNSUPPORTED',
      fields: { currency: anyString },
    });
  });

  it('answers NOT_FOUND for a type or tag that is not the person’s', async () => {
    const base = { name: 'Pot', kind: 'asset', currency: 'EUR', via: 'form' };
    expect(
      await errorOf(await p.post('/api/holdings', { ...base, typeId: unknownId('typ') }), 404),
    ).toMatchObject({ code: 'NOT_FOUND', fields: { typeId: anyString } });
    expect(
      await errorOf(
        await p.post('/api/holdings', { ...base, typeId: cashType, tagIds: [unknownId('tag')] }),
        404,
      ),
    ).toMatchObject({ code: 'NOT_FOUND', fields: { 'tagIds[0]': anyString } });
  });

  it('answers 409 LIKELY_DUPLICATE with candidates, unless allowDuplicate', async () => {
    const body = { name: 'Holiday fund', kind: 'asset', typeId: cashType, currency: 'EUR' };
    const first = await create({
      ...body,
      opening: { amount: 900, date: '2026-07-30' },
      via: 'form',
    });
    const again = await errorOf(await p.post('/api/holdings', { ...body, via: 'guided' }), 409);
    expect(again).toMatchObject({
      code: 'LIKELY_DUPLICATE',
      candidates: [
        {
          id: first.result.id,
          name: 'Holiday fund',
          latest: { date: '2026-07-30', amountMinor: 90000, currency: 'EUR' },
        },
      ],
    });
    const anyway = await create({ ...body, via: 'guided', allowDuplicate: true });
    expect(anyway.result.id).not.toBe(first.result.id);
  });

  it('needs a session', async () => {
    const res = await send(target, null, 'POST', '/api/holdings', { json: {} });
    expect(await errorOf(res, 401)).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers NOT_FOUND before the ledger exists', async () => {
    const fresh = await newPerson(target);
    const res = await fresh.post('/api/holdings', {
      name: 'Pot',
      kind: 'asset',
      universal: 'cash',
      currency: 'EUR',
      via: 'form',
    });
    expect(await errorOf(res, 404)).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('PATCH /api/holdings/:id', () => {
  it('renames, retypes and archives a holding', async () => {
    const { result: made } = await create({
      name: 'Spare change',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      via: 'form',
    });
    const listed = await typeIdOf(p, 'listed');
    const patched = await json<WriteBody<HoldingBody>>(
      await p.patch(`/api/holdings/${made.id}`, {
        name: 'Share pot',
        typeId: listed,
        archived: true,
      }),
    );
    expect(patched.result).toMatchObject({ name: 'Share pot', typeId: listed, archived: true });
    expect(patched.warnings).toStrictEqual([]);
    expect(patched.dataVersion).toBe((await snapshotOf(p)).dataVersion);

    // Nothing to change writes nothing: the version stays.
    const same = await json<WriteBody<HoldingBody>>(await p.patch(`/api/holdings/${made.id}`, {}));
    expect(same.dataVersion).toBe(patched.dataVersion);
  });

  it('names each bad field, and a malformed id', async () => {
    const { result: made } = await create({
      name: 'Coin jar',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      via: 'form',
    });
    const cases: [unknown, string][] = [
      [{ name: '' }, 'name'],
      [{ cadenceDays: 0 }, 'cadenceDays'],
      [{ archived: 'yes' }, 'archived'],
      [{ currency: 'USD' }, 'currency'],
      ['[1]', 'body'],
    ];
    for (const [body, field] of cases) {
      const error = await errorOf(await p.patch(`/api/holdings/${made.id}`, body), 400);
      expect(error.fields, JSON.stringify(body)).toHaveProperty([field]);
    }
    expect(
      await errorOf(await p.patch('/api/holdings/not-an-id', { name: 'X' }), 400),
    ).toMatchObject({ code: 'VALIDATION_FAILED', fields: { id: anyString } });
    expect(
      await errorOf(await p.patch(`/api/holdings/${unknownId('val')}`, { name: 'X' }), 400),
    ).toMatchObject({ fields: { id: anyString } });
  });

  it('answers NOT_FOUND for a holding, or a type, that is not there', async () => {
    expect(
      await errorOf(await p.patch(`/api/holdings/${unknownId('hld')}`, { name: 'X' }), 404),
    ).toMatchObject({ code: 'NOT_FOUND' });
    const { result: made } = await create({
      name: 'Tin box',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      via: 'form',
    });
    expect(
      await errorOf(await p.patch(`/api/holdings/${made.id}`, { typeId: unknownId('typ') }), 404),
    ).toMatchObject({ code: 'NOT_FOUND', fields: { typeId: anyString } });
  });
});

describe('DELETE /api/holdings/:id', () => {
  it('deletes a holding with its values; the result is null', async () => {
    const { result: made } = await create({
      name: 'Piggy bank',
      kind: 'asset',
      typeId: cashType,
      currency: 'EUR',
      opening: { amount: '12', date: '2026-07-01' },
      via: 'form',
    });
    const body = await json<WriteBody<null>>(await p.delete(`/api/holdings/${made.id}`));
    expect(body).toStrictEqual({ result: null, dataVersion: anyNumber, warnings: [] });
    const snapshot = await snapshotOf(p);
    expect(snapshot.dataVersion).toBe(body.dataVersion);
    expect(snapshot.values).not.toHaveProperty([made.id]);
  });

  it('refuses a malformed id, and answers NOT_FOUND for one that is not there', async () => {
    expect(await errorOf(await p.delete('/api/holdings/12345'), 400)).toMatchObject({
      fields: { id: anyString },
    });
    expect(await errorOf(await p.delete(`/api/holdings/${unknownId('hld')}`), 404)).toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
