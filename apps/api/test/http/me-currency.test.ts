import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProfileView, ValueTuple } from '@netnet/contracts';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyString } from '../ledger/support';
import {
  errorOf,
  json,
  ledgerApp,
  newPerson,
  onboarded,
  snapshotOf,
  type LedgerApp,
  type Person,
} from './support';

/**
 * `PATCH /api/me {baseCurrency}` (P3-T3): the ledger's history re-derived in the new currency, as
 * one `system` change. With the first country it chooses the ledger's currency instead; with
 * another country it moves the country first, then the currency.
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

type ValuesByHolding = Record<string, ValueTuple[]>;

async function valuesOf(p: Person): Promise<ValuesByHolding> {
  const snapshot = await snapshotOf(p);
  return (snapshot.values ?? {}) as ValuesByHolding;
}

async function ledgerOf(
  userId: string,
): Promise<{ base_currency: string; data_version: number } | null> {
  const { rows } = await db.owner.query<{ base_currency: string; data_version: number }>(
    'select base_currency, data_version from ledger.ledger_state where user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

interface SeenAudit {
  actor: string;
  entity: string;
  action: string;
}

async function auditsOf(userId: string): Promise<SeenAudit[]> {
  const { rows } = await db.owner.query<SeenAudit>(
    'select actor, entity, action from ledger.audit where user_id = $1 order by at, id',
    [userId],
  );
  return rows;
}

describe('PATCH /api/me {baseCurrency}', () => {
  it('re-derives the history in the new currency, as one system change', async () => {
    const p = await onboarded(target, 'QZ');
    const euro = await json<{ result: { id: string } }>(
      await p.post('/api/holdings', {
        name: 'Euro savings',
        kind: 'asset',
        universal: 'cash',
        currency: 'EUR',
        via: 'form',
      }),
    );
    const dollar = await json<{ result: { id: string } }>(
      await p.post('/api/holdings', {
        name: 'Dollar savings',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        via: 'form',
      }),
    );
    await json(
      await p.post(`/api/holdings/${euro.result.id}/values`, {
        amount: '1000',
        date: '2026-07-15',
      }),
    );
    await json(
      await p.post(`/api/holdings/${dollar.result.id}/values`, {
        amount: '300',
        date: '2026-07-15',
      }),
    );
    const before = await ledgerOf(p.userId);
    const seen = (await auditsOf(p.userId)).length;

    const me = await json<ProfileView>(await p.patch('/api/me', { baseCurrency: 'USD' }));

    expect(me.baseCurrency).toBe('USD');
    expect(await ledgerOf(p.userId)).toStrictEqual({
      base_currency: 'USD',
      data_version: before!.data_version + 1,
    });
    // The euro at its stored July rate (1.25), the dollar as itself.
    const values = await valuesOf(p);
    expect(values[euro.result.id]).toStrictEqual([
      ['2026-07-15', 100000, 'EUR', 125000, 'web', null, anyString],
    ]);
    expect(values[dollar.result.id]).toStrictEqual([
      ['2026-07-15', 30000, 'USD', 30000, 'web', null, anyString],
    ]);
    expect((await auditsOf(p.userId)).slice(seen)).toStrictEqual([
      { actor: 'system', entity: 'value', action: 'update' },
      { actor: 'system', entity: 'value', action: 'update' },
      { actor: 'system', entity: 'ledger', action: 'update' },
    ]);
  });

  it('raises lower case, and the same currency changes nothing', async () => {
    const p = await onboarded(target, 'QZ');
    expect(
      await json<ProfileView>(await p.patch('/api/me', { baseCurrency: 'usd' })),
    ).toMatchObject({
      baseCurrency: 'USD',
    });
    const before = await ledgerOf(p.userId);
    const seen = (await auditsOf(p.userId)).length;

    expect(
      await json<ProfileView>(await p.patch('/api/me', { baseCurrency: 'USD' })),
    ).toMatchObject({
      baseCurrency: 'USD',
    });
    expect(await ledgerOf(p.userId)).toStrictEqual(before);
    expect((await auditsOf(p.userId)).length).toBe(seen);
  });

  it.each(['ZZZ', 'US', ''])('refuses %j, naming baseCurrency', async (baseCurrency) => {
    const p = await onboarded(target, 'QZ');
    const error = await errorOf(await p.patch('/api/me', { baseCurrency }), 400);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { baseCurrency: expect.any(String) as string },
    });
    expect(await ledgerOf(p.userId)).toMatchObject({ base_currency: 'EUR' });
  });

  it('needs the ledger first: a currency alone before any country names the country', async () => {
    const p = await newPerson(target);
    const error = await errorOf(await p.patch('/api/me', { baseCurrency: 'USD' }), 400);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { country: expect.any(String) as string },
    });
    expect(await ledgerOf(p.userId)).toBeNull();
  });

  it('makes the first ledger in the base currency asked for with the country', async () => {
    const p = await newPerson(target);
    const me = await json<ProfileView>(
      await p.patch('/api/me', { country: 'QZ', baseCurrency: 'USD' }),
    );
    expect(me).toMatchObject({ country: 'QZ', baseCurrency: 'USD' });
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'USD', data_version: 1 });
  });

  it('moves the country first, then the currency, when asked for both', async () => {
    const p = await onboarded(target, 'US');
    await json(
      await p.post('/api/holdings', {
        name: 'Current account',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        via: 'form',
      }),
    );
    const before = (await snapshotOf(p)).dataVersion;

    const me = await json<ProfileView>(
      await p.patch('/api/me', { country: 'QZ', baseCurrency: 'GBP' }),
    );

    expect(me).toMatchObject({ country: 'QZ', baseCurrency: 'GBP' });
    const snapshot = await snapshotOf(p);
    expect(snapshot.dataVersion).toBe(before + 2);
    expect(snapshot.baseCurrency).toBe('GBP');
    expect(
      snapshot.types.filter((t) => t.packTypeKey !== null).map((t) => t.packTypeKey),
    ).toStrictEqual(['auto_loan']);
  });

  it('leaves another person’s ledger alone', async () => {
    const a = await onboarded(target, 'QZ');
    const holding = await json<{ result: { id: string } }>(
      await a.post('/api/holdings', {
        name: 'Euro savings',
        kind: 'asset',
        universal: 'cash',
        currency: 'EUR',
        via: 'form',
      }),
    );
    await json(
      await a.post(`/api/holdings/${holding.result.id}/values`, {
        amount: '1000',
        date: '2026-07-15',
      }),
    );
    const b = await onboarded(target, 'US');
    const stateOf = (userId: string) =>
      db.owner.query('select * from ledger.value where user_id = $1 order by id', [userId]);
    const aValues = JSON.stringify((await stateOf(a.userId)).rows);
    const aLedger = await ledgerOf(a.userId);

    expect(
      await json<ProfileView>(await b.patch('/api/me', { baseCurrency: 'EUR' })),
    ).toMatchObject({
      baseCurrency: 'EUR',
    });

    expect(JSON.stringify((await stateOf(a.userId)).rows)).toBe(aValues);
    expect(await ledgerOf(a.userId)).toStrictEqual(aLedger);
    expect(await ledgerOf(b.userId)).toMatchObject({ base_currency: 'EUR' });
  });
});
