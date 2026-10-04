import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNIVERSALS } from '@netnet/contracts';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyString, like } from '../ledger/support';
import { errorOf, json, ledgerApp, newPerson, snapshotOf, type LedgerApp } from './support';

/**
 * The first country the person confirms makes their ledger (`PATCH /api/me {country}`, PRD J1),
 * in the same request: in that country's currency, with every universal type and the pack's own
 * types (generic only when the country has no pack). Once. A later confirmation, of the same
 * country or another, leaves the ledger as it is (a change of country is P3's).
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

interface LedgerRow {
  base_currency: string;
  data_version: number;
}

async function ledgerOf(userId: string): Promise<LedgerRow | null> {
  const { rows } = await db.owner.query<LedgerRow>(
    'select base_currency, data_version from ledger.ledger_state where user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

async function typeCount(userId: string): Promise<number> {
  const { rows } = await db.owner.query<{ n: number }>(
    'select count(*)::int as n from ledger.user_type where user_id = $1',
    [userId],
  );
  return rows[0]?.n ?? 0;
}

describe('PATCH /api/me {country}', () => {
  it('makes the ledger on the first confirmation, with the pack’s types in the snapshot', async () => {
    const p = await newPerson(target);
    expect(await errorOf(await p.get('/api/snapshot'), 404)).toMatchObject({ code: 'NOT_FOUND' });
    expect(await ledgerOf(p.userId)).toBeNull();

    const me = await json(await p.patch('/api/me', { country: 'QZ' }));
    expect(me).toMatchObject({ country: 'QZ', baseCurrency: 'EUR' });
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'EUR', data_version: 1 });

    const snapshot = await snapshotOf(p);
    expect(snapshot).toMatchObject({
      dataVersion: 1,
      baseCurrency: 'EUR',
      packRef: [
        { key: 'qz', version: 1 },
        { key: 'generic', version: 1 },
      ],
      prefs: {},
      tags: [],
      holdings: [],
      values: {},
    });
    expect(snapshot.types.map((t) => t.universal).slice(0, UNIVERSALS.length)).toStrictEqual([
      ...UNIVERSALS,
    ]);
    expect(snapshot.types.filter((t) => t.packTypeKey !== null)).toStrictEqual([
      like({ universal: 'loan', packTypeKey: 'auto_loan' }),
    ]);
  });

  it('does not make it again: a second confirmation, or another country, leaves it alone', async () => {
    const p = await newPerson(target);
    await json(await p.patch('/api/me', { country: 'QZ' }));
    const types = await typeCount(p.userId);

    expect(await json(await p.patch('/api/me', { country: 'QZ' }))).toMatchObject({
      baseCurrency: 'EUR',
    });
    expect(await json(await p.patch('/api/me', { country: 'GB' }))).toMatchObject({
      country: 'GB',
      baseCurrency: 'EUR',
    });
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'EUR', data_version: 1 });
    expect(await typeCount(p.userId)).toBe(types);
  });

  it('makes a generic ledger for a country without a pack', async () => {
    const p = await newPerson(target);
    expect(await json(await p.patch('/api/me', { country: 'US' }))).toMatchObject({
      baseCurrency: 'USD',
    });
    const snapshot = await snapshotOf(p);
    expect(snapshot).toMatchObject({
      baseCurrency: 'USD',
      packRef: [{ key: 'generic', version: 1 }],
    });
    expect(snapshot.types).toHaveLength(UNIVERSALS.length);
    expect(snapshot.types.every((t) => t.packTypeKey === null)).toBe(true);
  });

  it('makes one ledger when two first confirmations arrive at once', async () => {
    const p = await newPerson(target);
    const [first, second] = await Promise.all([
      p.patch('/api/me', { country: 'QZ' }),
      p.patch('/api/me', { country: 'QZ' }),
    ]);
    expect([first?.status, second?.status]).toStrictEqual([200, 200]);
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'EUR', data_version: 1 });
    expect(await typeCount(p.userId)).toBe(UNIVERSALS.length + 1);
  });

  it('makes nothing when the request is refused, or names no country', async () => {
    const p = await newPerson(target);
    await errorOf(await p.patch('/api/me', { country: 'ZZ' }), 400);
    await json(await p.patch('/api/me', { segment: 'starting_out', timeZone: 'Asia/Tokyo' }));
    const refused = await p.patch('/api/me', { segment: 'established', country: 'QZ' });
    expect(await errorOf(refused, 400)).toMatchObject({ fields: { segment: anyString } });
    expect(await ledgerOf(p.userId)).toBeNull();
    expect(await json(await p.get('/api/me'))).toMatchObject({ country: null, baseCurrency: null });
  });
});
