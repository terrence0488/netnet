import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNIVERSALS } from '@netnet/contracts';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { anyString, like } from '../ledger/support';
import { errorOf, json, ledgerApp, newPerson, snapshotOf, type LedgerApp } from './support';

/**
 * The first country the person confirms makes their ledger (`PATCH /api/me {country}`, PRD J1),
 * in the same request: in that country's currency, with every universal type and the pack's own
 * types (generic only when the country has no pack). Once. Another country moves it (J2): over
 * again while it has no holding, else adding the new pack's types; the same country changes
 * nothing.
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

  it('does not make it again: the same country confirmed twice changes nothing', async () => {
    const p = await newPerson(target);
    await json(await p.patch('/api/me', { country: 'QZ' }));
    const types = await typeCount(p.userId);

    expect(await json(await p.patch('/api/me', { country: 'QZ' }))).toMatchObject({
      baseCurrency: 'EUR',
    });
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'EUR', data_version: 1 });
    expect(await typeCount(p.userId)).toBe(types);
  });

  it('starts the ledger over in another country while it has no holding (Back in onboarding)', async () => {
    const p = await newPerson(target);
    await json(await p.patch('/api/me', { country: 'QZ' }));
    expect(await json(await p.patch('/api/me', { country: 'GB' }))).toMatchObject({
      country: 'GB',
      baseCurrency: 'GBP',
    });
    const snapshot = await snapshotOf(p);
    expect(snapshot).toMatchObject({
      dataVersion: 2,
      baseCurrency: 'GBP',
      packRef: [{ key: 'generic', version: 1 }],
    });
    expect(snapshot.types).toHaveLength(UNIVERSALS.length);
    expect(snapshot.types.every((t) => t.packTypeKey === null)).toBe(true);
  });

  it('keeps the currency once it has a holding, and adds the new pack’s types', async () => {
    const p = await newPerson(target);
    await json(await p.patch('/api/me', { country: 'GB' }));
    await json(
      await p.post('/api/holdings', {
        name: 'Current account',
        kind: 'asset',
        universal: 'cash',
        currency: 'GBP',
        via: 'form',
      }),
    );
    const types = await typeCount(p.userId);
    expect(await json(await p.patch('/api/me', { country: 'QZ' }))).toMatchObject({
      country: 'QZ',
      baseCurrency: 'GBP',
    });
    const snapshot = await snapshotOf(p);
    expect(snapshot.baseCurrency).toBe('GBP');
    expect(snapshot.types).toHaveLength(types + 1);
    expect(snapshot.types.filter((t) => t.packTypeKey !== null)).toStrictEqual([
      like({ universal: 'loan', packTypeKey: 'auto_loan' }),
    ]);
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

  it('makes one ledger at data_version 1 when five first confirmations arrive at once', async () => {
    // The shape of P4-T13's probe (five simultaneous confirmations): one ledger, its first types,
    // no country move. A duplicate move would bump data_version and replace the types.
    const p = await newPerson(target);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => p.patch('/api/me', { country: 'QZ' })),
    );
    expect(responses.map((res) => res.status)).toStrictEqual([200, 200, 200, 200, 200]);
    expect(await ledgerOf(p.userId)).toStrictEqual({ base_currency: 'EUR', data_version: 1 });

    const snapshot = await snapshotOf(p);
    expect(snapshot).toMatchObject({ dataVersion: 1, baseCurrency: 'EUR' });
    expect(snapshot.types).toHaveLength(UNIVERSALS.length + 1);
    expect(snapshot.types.map((t) => t.universal).slice(0, UNIVERSALS.length)).toStrictEqual([
      ...UNIVERSALS,
    ]);
    expect(snapshot.types.filter((t) => t.packTypeKey !== null)).toStrictEqual([
      like({ universal: 'loan', packTypeKey: 'auto_loan' }),
    ]);

    // The first types, not a replacement: one create each and none deleted. The anomaly the review
    // found was `data_version` 2 with `type create 26, type delete 13`.
    const { rows: audited } = await db.owner.query<{ entity: string; action: string; n: number }>(
      `select entity, action, count(*)::int as n from ledger.audit
        where user_id = $1 and entity in ('ledger', 'type')
        group by entity, action order by entity, action`,
      [p.userId],
    );
    expect(audited).toStrictEqual([
      { entity: 'ledger', action: 'create', n: 1 },
      { entity: 'type', action: 'create', n: UNIVERSALS.length + 1 },
    ]);
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
