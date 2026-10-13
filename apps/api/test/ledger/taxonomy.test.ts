import { UNIVERSALS } from '@netnet/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  anyString,
  appError,
  auditRows,
  containing,
  COUNTRY_V1,
  dataVersion,
  ledgerSuite,
  like,
  newUserId,
  rowCounts,
  USER,
  type LedgerSuite,
} from './support';

/** Types, tags and prefs (PRD J2, J4, J11; architecture §6.3): nothing is ever orphaned. */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Rows anywhere in the user's ledger that point at something gone, saved filters included. */
async function orphans(userId: string): Promise<string[]> {
  const found: string[] = [];
  const holdings = await suite.rows<{ id: string; type_id: string }>(
    `select h.id, h.type_id from ledger.holding h
      where h.user_id = $1 and not exists
        (select 1 from ledger.user_type t where t.user_id = h.user_id and t.id = h.type_id)`,
    [userId],
  );
  found.push(...holdings.map((h) => `holding ${h.id} → type ${h.type_id}`));
  const links = await suite.rows<{ tag_id: string }>(
    `select l.tag_id from ledger.holding_tag l
      where l.user_id = $1 and not exists
        (select 1 from ledger.tag t where t.user_id = l.user_id and t.id = l.tag_id)`,
    [userId],
  );
  found.push(...links.map((l) => `link → tag ${l.tag_id}`));
  const prefs = await suite.rows<{ key: string; value: Record<string, string[]> }>(
    `select key, value from ledger.prefs where user_id = $1 and key like '%filter'`,
    [userId],
  );
  const ids = new Set(
    (
      await suite.rows<{ id: string }>(
        `select id from ledger.user_type where user_id = $1 union all
         select id from ledger.tag where user_id = $1 union all
         select id from ledger.holding where user_id = $1`,
        [userId],
      )
    ).map((r) => r.id),
  );
  for (const { key, value } of prefs) {
    for (const list of Object.values(value)) {
      if (!Array.isArray(list)) continue;
      for (const id of list) if (!ids.has(id)) found.push(`${key} → ${id}`);
    }
  }
  return found;
}

describe('init', () => {
  it('creates the ledger with one unnamed type per universal type and the pack’s types, once', async () => {
    const userId = newUserId();
    await suite
      .as(userId)
      .write((l) => l.init({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    const types = await suite.rows<{
      universal: string;
      pack_type_key: string | null;
      custom_name: string | null;
    }>(
      'select universal, pack_type_key, custom_name from ledger.user_type where user_id = $1 order by sort',
      [userId],
    );
    expect(types).toEqual([
      ...UNIVERSALS.map((universal) => ({ universal, pack_type_key: null, custom_name: null })),
      { universal: 'loan', pack_type_key: 'auto_loan', custom_name: null },
    ]);
    expect(await dataVersion(suite, userId)).toBe(1);
    const audits = await auditRows(suite, userId);
    expect(audits).toHaveLength(14);
    expect(audits[0]).toMatchObject({
      entity: 'ledger',
      action: 'create',
      after: { baseCurrency: 'EUR' },
    });
    const snapshot = await suite.as(userId).read((l) => l.snapshot());
    expect(snapshot).toMatchObject({
      dataVersion: 1,
      baseCurrency: 'EUR',
      holdings: [],
      tags: [],
      prefs: {},
    });

    const counts = await rowCounts(suite, userId);
    await suite
      .as(userId)
      .write((l) => l.init({ baseCurrency: 'USD', pack: suite.content.ref(null) }));
    expect(await rowCounts(suite, userId)).toEqual(counts);
  });

  it('refuses a currency not in circulation and a malformed pack reference', async () => {
    const userId = newUserId();
    const currency = await appError(
      suite.as(userId).write((l) => l.init({ baseCurrency: 'ABC', pack: suite.content.ref(null) })),
    );
    expect(currency).toMatchObject({
      code: 'CURRENCY_UNSUPPORTED',
      details: { fields: { baseCurrency: anyString } },
    });
    const pack = await appError(
      suite.as(userId).write((l) => l.init({ baseCurrency: 'USD', pack: [] })),
    );
    expect(pack).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { pack: anyString } },
    });
    expect(await dataVersion(suite, userId)).toBeNull();
  });

  it('is needed before anything else: other calls are NOT_FOUND until then', async () => {
    const userId = newUserId();
    expect((await appError(suite.as(userId).read((l) => l.snapshot()))).code).toBe('NOT_FOUND');
    expect((await appError(suite.as(userId).write((l) => l.upsertTag({ name: 'x' })))).code).toBe(
      'NOT_FOUND',
    );
  });
});

describe('applyPackTypes', () => {
  it('adds the pack’s missing types and removes none', async () => {
    const userId = await suite.newUser('USD', null);
    const before = await suite.rows('select id from ledger.user_type where user_id = $1', [userId]);
    const write = await suite.as(userId).write((l) => l.applyPackTypes(suite.content.ref('qz')));
    expect(write.result).toEqual([
      like({
        universal: 'loan',
        packTypeKey: 'auto_loan',
        customName: null,
        sort: 12,
      }),
    ]);
    const again = await suite.as(userId).write((l) => l.applyPackTypes(suite.content.ref('qz')));
    expect(again).toMatchObject({ result: [], dataVersion: write.dataVersion });
    suite.content.publish({ ...COUNTRY_V1, version: 3, types: [] });
    const none = await suite.as(userId).write((l) => l.applyPackTypes([{ key: 'qz', version: 3 }]));
    expect(none.result).toEqual([]);
    const after = await suite.rows('select id from ledger.user_type where user_id = $1', [userId]);
    expect(after).toHaveLength(before.length + 1);
    suite.content.publish({ ...COUNTRY_V1, version: 4 });
  });
});

describe('changeCountry', () => {
  /** The user's types, in order, as (universal, pack type) pairs, with their ids. */
  async function typesOf(userId: string) {
    return suite.rows<{ id: string; universal: string; pack_type_key: string | null }>(
      'select id, universal, pack_type_key from ledger.user_type where user_id = $1 order by sort',
      [userId],
    );
  }

  it('with no holding, starts the ledger over in the new currency and types', async () => {
    const userId = await suite.newUser('USD', null);
    const first = await typesOf(userId);
    const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Kept' }));
    await suite
      .as(userId)
      .write((l) =>
        l.setPrefs({ homeFilter: { typeIds: [first[0]!.id], tagIds: [tag.result.id] } }),
      );
    const version = await dataVersion(suite, userId);
    const seen = (await auditRows(suite, userId)).length;

    const write = await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));

    expect(write.dataVersion).toBe(version! + 1);
    const types = await typesOf(userId);
    expect(types.map(({ universal, pack_type_key }) => ({ universal, pack_type_key }))).toEqual([
      ...UNIVERSALS.map((universal) => ({ universal, pack_type_key: null })),
      { universal: 'loan', pack_type_key: 'auto_loan' },
    ]);
    expect(types.filter((t) => first.some((f) => f.id === t.id))).toEqual([]);
    const snapshot = await suite.as(userId).read((l) => l.snapshot());
    expect(snapshot).toMatchObject({
      baseCurrency: 'EUR',
      tags: [like({ id: tag.result.id })],
      prefs: { homeFilter: { tagIds: [tag.result.id] } },
    });
    expect(await orphans(userId)).toEqual([]);
    const audits = (await auditRows(suite, userId)).slice(seen);
    expect(audits.map((r) => [r.entity, r.action])).toEqual([
      ['prefs', 'update'],
      ...first.map(() => ['type', 'delete']),
      ...types.map(() => ['type', 'create']),
      ['ledger', 'update'],
    ]);
    expect(audits.at(-1)).toMatchObject({
      before: { baseCurrency: 'USD' },
      after: { baseCurrency: 'EUR' },
    });
  });

  it('with a holding, keeps the currency and adds the pack’s types, removing none', async () => {
    const userId = await suite.newUser('USD', null);
    await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Account', kind: 'asset', universal: 'cash', currency: 'USD' }),
      );
    const first = await typesOf(userId);
    const write = await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    const types = await typesOf(userId);
    expect(types.slice(0, first.length)).toEqual(first);
    expect(types.slice(first.length)).toEqual([like({ pack_type_key: 'auto_loan' })]);
    expect((await suite.as(userId).read((l) => l.snapshot())).baseCurrency).toBe('USD');

    const again = await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'EUR', pack: suite.content.ref('qz') }));
    expect(again.dataVersion).toBe(write.dataVersion);
  });

  it('moving back with a holding removes nothing and leaves outcomes as applied', async () => {
    const userId = await suite.newUser('EUR', 'qz');
    const cash = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Current account',
        kind: 'asset',
        universal: 'cash',
        currency: 'EUR',
      }),
    );
    const home = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Flat',
        kind: 'asset',
        universal: 'property',
        currency: 'EUR',
        access: 'home',
      }),
    );
    const first = await typesOf(userId);
    expect(first.some((t) => t.pack_type_key === 'auto_loan')).toBe(true);
    const before = await suite.as(userId).read((l) => l.snapshot());
    const version = await dataVersion(suite, userId);

    const write = await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'USD', pack: suite.content.ref(null) }));

    // Generic adds nothing the ledger lacks: every type stays, by id, and nothing is written.
    expect(await typesOf(userId)).toEqual(first);
    expect(write.dataVersion).toBe(version);
    const after = await suite.as(userId).read((l) => l.snapshot());
    expect(after.baseCurrency).toBe('EUR');
    for (const id of [cash.result.id, home.result.id]) {
      const was = before.holdings.find((h) => h.id === id)!;
      const now = after.holdings.find((h) => h.id === id)!;
      expect(now).toMatchObject({
        typeId: was.typeId,
        access: was.access,
        accessReason: was.accessReason,
        accessUntil: was.accessUntil,
        accessBasis: was.accessBasis,
      });
    }
    expect(after.holdings.find((h) => h.id === home.result.id)).toMatchObject({
      access: 'locked',
      accessReason: 'it is your home',
    });
    expect(await orphans(userId)).toEqual([]);
  });

  it('moving back with no holding starts over in the generic types', async () => {
    const userId = await suite.newUser('EUR', 'qz');
    const first = await typesOf(userId);
    expect(first.some((t) => t.pack_type_key === 'auto_loan')).toBe(true);

    await suite
      .as(userId)
      .write((l) => l.changeCountry({ baseCurrency: 'USD', pack: suite.content.ref(null) }));

    const types = await typesOf(userId);
    expect(types.map(({ universal, pack_type_key }) => ({ universal, pack_type_key }))).toEqual(
      UNIVERSALS.map((universal) => ({ universal, pack_type_key: null })),
    );
    expect(types.filter((t) => first.some((f) => f.id === t.id))).toEqual([]);
    expect((await suite.as(userId).read((l) => l.snapshot())).baseCurrency).toBe('USD');
    expect(await orphans(userId)).toEqual([]);
  });

  it('refuses a currency not in circulation, and needs the ledger', async () => {
    const userId = await suite.newUser('USD', null);
    const refused = await appError(
      suite
        .as(userId)
        .write((l) => l.changeCountry({ baseCurrency: 'ABC', pack: suite.content.ref(null) })),
    );
    expect(refused).toMatchObject({
      code: 'CURRENCY_UNSUPPORTED',
      details: { fields: { baseCurrency: anyString } },
    });
    const missing = await appError(
      suite
        .as(newUserId())
        .write((l) => l.changeCountry({ baseCurrency: 'USD', pack: suite.content.ref(null) })),
    );
    expect(missing.code).toBe('NOT_FOUND');
  });
});

describe('types', () => {
  it('creates a custom type and renames it; labels follow the pack until then', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite
      .as(userId)
      .write((l) => l.upsertType({ name: 'Collectibles', universal: 'other' }));
    expect(created.result).toMatchObject({
      universal: 'other',
      packTypeKey: null,
      customName: 'Collectibles',
      sort: 13,
    });
    const renamed = await suite
      .as(userId)
      .write((l) => l.upsertType({ id: created.result.id, name: 'Art' }));
    expect(renamed.result.customName).toBe('Art');
    const cash = await suite.typeId(userId, 'cash');
    const holding = await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Account', kind: 'asset', typeId: cash, currency: 'USD' }),
      );
    const view = async () =>
      (await suite.as(userId).read((l) => l.getHolding(holding.result.id))).typeLabel;
    expect(await view()).toBe('Current account');
    await suite.as(userId).write((l) => l.upsertType({ id: cash, name: 'Everyday money' }));
    expect(await view()).toBe('Everyday money');
    const audits = (await auditRows(suite, userId)).filter(
      (a) => a.entity === 'type' && a.action === 'update',
    );
    expect(audits.map((a) => [a.before, a.after])).toEqual([
      [like({ customName: 'Collectibles' }), like({ customName: 'Art' })],
      [like({ customName: null }), like({ customName: 'Everyday money' })],
    ]);
  });

  it('refuses a new type without a universal type, and a change of universal type', async () => {
    const userId = await suite.newUser('USD');
    const missing = await appError(suite.as(userId).write((l) => l.upsertType({ name: 'Things' })));
    expect(missing.details?.fields).toHaveProperty('universal');
    const cash = await suite.typeId(userId, 'cash');
    const change = await appError(
      suite.as(userId).write((l) => l.upsertType({ id: cash, name: 'Cash', universal: 'listed' })),
    );
    expect(change.details?.fields).toHaveProperty('universal');
    expect(
      (await appError(suite.as(userId).write((l) => l.upsertType({ id: 'typ_nope', name: 'X' }))))
        .code,
    ).toBe('NOT_FOUND');
  });

  it('deletes an unused type, refuses one in use without moveTo, and merges with it', async () => {
    const userId = await suite.newUser('USD');
    const listed = await suite.typeId(userId, 'listed');
    const funds = await suite
      .as(userId)
      .write((l) => l.upsertType({ name: 'Funds', universal: 'listed' }));
    const spare = await suite
      .as(userId)
      .write((l) => l.upsertType({ name: 'Spare', universal: 'other' }));
    await suite.as(userId).write((l) => l.deleteType(spare.result.id));
    const holdings = [];
    for (const name of ['Fund A', 'Fund B']) {
      const w = await suite.as(userId).write((l) =>
        l.createHolding({
          name,
          kind: 'asset',
          typeId: funds.result.id,
          currency: 'USD',
          allowDuplicate: true,
        }),
      );
      holdings.push(w.result);
    }
    await suite.as(userId).write((l) =>
      l.setPrefs({
        homeFilter: { typeIds: [funds.result.id, listed] },
        insightsFilter: { hideTypeIds: [funds.result.id] },
      }),
    );

    const counts = await rowCounts(suite, userId);
    const refused = await appError(suite.as(userId).write((l) => l.deleteType(funds.result.id)));
    expect(refused).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { moveTo: containing('2 holdings') } },
    });
    expect(await rowCounts(suite, userId)).toEqual(counts);
    expect(
      (
        await appError(
          suite.as(userId).write((l) => l.deleteType(funds.result.id, funds.result.id)),
        )
      ).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      (await appError(suite.as(userId).write((l) => l.deleteType(funds.result.id, 'typ_nope'))))
        .code,
    ).toBe('NOT_FOUND');

    const merged = await suite.as(userId).write((l) => l.deleteType(funds.result.id, listed));
    const after = await suite.rows<{ type_id: string; row_version: number; access: string }>(
      'select type_id, row_version, access from ledger.holding where user_id = $1 order by id',
      [userId],
    );
    expect(after).toEqual([
      { type_id: listed, row_version: 2, access: 'accessible' },
      { type_id: listed, row_version: 2, access: 'accessible' },
    ]);
    const audits = (await auditRows(suite, userId)).slice(-5);
    expect(audits.map((a) => [a.entity, a.action])).toEqual([
      ['holding', 'update'],
      ['holding', 'update'],
      ['prefs', 'update'],
      ['prefs', 'update'],
      ['type', 'delete'],
    ]);
    const prefs = await suite.as(userId).read((l) => l.snapshot());
    expect(prefs.prefs).toEqual({
      homeFilter: { typeIds: [listed] },
      insightsFilter: { hideTypeIds: [listed] },
    });
    expect(merged.dataVersion).toBe((await dataVersion(suite, userId)) ?? -1);
    expect(await orphans(userId)).toEqual([]);
  });
});

describe('tags', () => {
  it('creates and renames tags, unique by name case aside', async () => {
    const userId = await suite.newUser('USD');
    const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Long term' }));
    const taken = await appError(suite.as(userId).write((l) => l.upsertTag({ name: 'LONG TERM' })));
    expect(taken).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { name: containing(tag.result.id) } },
    });
    const other = await suite.as(userId).write((l) => l.upsertTag({ name: 'Short term' }));
    expect(other.result.sort).toBe(1);
    const clash = await appError(
      suite.as(userId).write((l) => l.upsertTag({ id: other.result.id, name: 'long term' })),
    );
    expect(clash.details?.fields?.name).toContain('mergeInto');
    const renamed = await suite
      .as(userId)
      .write((l) => l.upsertTag({ id: tag.result.id, name: 'Long-term' }));
    expect(renamed.result).toEqual({ id: tag.result.id, name: 'Long-term', sort: 0 });
    const same = await suite
      .as(userId)
      .write((l) => l.upsertTag({ id: tag.result.id, name: 'Long-term' }));
    expect(same.dataVersion).toBe(renamed.dataVersion);
  });

  it('deletes a tag, removing it from its holdings, or merges it into another', async () => {
    const userId = await suite.newUser('USD');
    const [a, b] = await Promise.all(
      ['A', 'B'].map(
        async (name) => (await suite.as(userId).write((l) => l.upsertTag({ name }))).result.id,
      ),
    ).then((ids) => ids.sort());
    const unused = await suite.as(userId).write((l) => l.upsertTag({ name: 'Unused' }));
    await suite.as(userId).write((l) => l.deleteTag(unused.result.id));
    const both = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Both',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        tagIds: [a!, b!],
      }),
    );
    const onlyA = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Only A',
        kind: 'asset',
        universal: 'listed',
        currency: 'USD',
        tagIds: [a!],
      }),
    );
    await suite
      .as(userId)
      .write((l) => l.setPrefs({ homeFilter: { tagIds: [a!], hideTagIds: [a!, b!] } }));

    expect((await appError(suite.as(userId).write((l) => l.deleteTag(a!, 'tag_nope')))).code).toBe(
      'NOT_FOUND',
    );

    // Without mergeInto, the holdings that carry the tag lose it; each change is audited.
    await suite.as(userId).write((l) => l.deleteTag(a!));
    const audits = (await auditRows(suite, userId)).slice(-4);
    expect(audits.map((r) => [r.entity, r.action])).toEqual([
      ['holding', 'update'],
      ['holding', 'update'],
      ['prefs', 'update'],
      ['tag', 'delete'],
    ]);
    expect(audits.filter((r) => r.entity === 'holding').map((r) => r.entity_id)).toEqual([
      both.result.id,
      onlyA.result.id,
    ]);
    const untagged = await suite.as(userId).read((l) => l.listHoldings({}));
    expect(untagged.items.map((h) => [h.id, h.tagIds])).toEqual([
      [both.result.id, [b]],
      [onlyA.result.id, []],
    ]);
    const afterRemove = await suite.as(userId).read((l) => l.snapshot());
    expect(afterRemove.tags.map((t) => t.id)).toEqual([b]);
    expect(afterRemove.prefs.homeFilter).toEqual({ tagIds: [], hideTagIds: [b] });

    // With mergeInto, they carry that tag instead.
    const c = await suite.as(userId).write((l) => l.upsertTag({ name: 'C' }));
    await suite
      .as(userId)
      .write((l) => l.updateHolding(onlyA.result.id, { tagIds: [c.result.id] }));
    await suite.as(userId).write((l) => l.deleteTag(c.result.id, b));
    const merged = await suite.as(userId).read((l) => l.listHoldings({}));
    expect(merged.items.map((h) => [h.id, h.tagIds])).toEqual([
      [both.result.id, [b]],
      [onlyA.result.id, [b]],
    ]);
    expect((await suite.as(userId).read((l) => l.snapshot())).tags.map((t) => t.id)).toEqual([b]);
    expect(await orphans(userId)).toEqual([]);
  });
});

describe('setPrefs', () => {
  it('sets, replaces and clears prefs, each key audited, and writes nothing for no change', async () => {
    const userId = await suite.newUser('USD');
    const set = await suite
      .as(userId)
      .write((l) =>
        l.setPrefs({ baseline: 'last_month', sort: 'value_desc', homeFilter: { show: 'assets' } }),
      );
    expect(set.result).toEqual({
      baseline: 'last_month',
      sort: 'value_desc',
      homeFilter: { show: 'assets' },
    });
    const same = await suite
      .as(userId)
      .write((l) => l.setPrefs({ baseline: 'last_month', homeFilter: { show: 'assets' } }));
    expect(same.dataVersion).toBe(set.dataVersion);
    const cleared = await suite
      .as(userId)
      .write((l) => l.setPrefs({ baseline: null, sort: 'name' }));
    expect(cleared.result).toEqual({ sort: 'name', homeFilter: { show: 'assets' } });
    const audits = (await auditRows(suite, userId)).filter((a) => a.entity === 'prefs');
    expect(audits.map((a) => [a.entity_id, a.action])).toEqual([
      ['home_filter', 'create'],
      ['baseline', 'create'],
      ['sort', 'create'],
      ['baseline', 'delete'],
      ['sort', 'update'],
    ]);
  });

  it('refuses ids that are not the user’s, and values the contract does not allow', async () => {
    const userId = await suite.newUser('USD');
    const missing = await appError(
      suite
        .as(userId)
        .write((l) => l.setPrefs({ insightsFilter: { hideHoldingIds: ['hld_nope'] } })),
    );
    expect(missing).toMatchObject({
      code: 'NOT_FOUND',
      details: { fields: { 'insightsFilter.hideHoldingIds[0]': anyString } },
    });
    const bad = await appError(
      suite.as(userId, USER).write((l) => l.setPrefs({ sort: 'size' } as never)),
    );
    expect(bad.details?.fields).toHaveProperty('sort');
  });
});
