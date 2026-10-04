import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openLedger } from '../../src/ledger/ledger';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import {
  agentActor,
  anyString,
  appError,
  auditRows,
  COUNTRY_V1,
  dataVersion,
  GENERIC_V1,
  ledgerSuite,
  like,
  rowCounts,
  USER,
  type LedgerSuite,
} from './support';

/** Holdings (PRD J2, J6; architecture §6.7, §7.4): create, update, delete, accessibility, duplicates. */
let db: TestDatabase;
let suite: LedgerSuite;

beforeAll(async () => {
  db = await createTestDatabase();
  suite = ledgerSuite(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('createHolding', () => {
  it('creates a holding with its tags and opening value, and fires holding_created and value_recorded', async () => {
    const userId = await suite.newUser('USD');
    const cash = await suite.typeId(userId, 'cash');
    const tag = await suite.as(userId).write((l) => l.upsertTag({ name: 'Emergency fund' }));
    const before = await dataVersion(suite, userId);
    const write = await suite.as(userId).write((l) =>
      l.createHolding({
        name: '  Everyday account ',
        kind: 'asset',
        typeId: cash,
        currency: 'usd',
        tagIds: [tag.result.id],
        opening: { amount: '1250.50', date: '2026-07-15' },
        via: 'form',
      }),
    );
    expect(write.dataVersion).toBe((before ?? 0) + 1);
    expect(write.result).toMatchObject({
      name: 'Everyday account',
      kind: 'asset',
      typeId: cash,
      currency: 'USD',
      tagIds: [tag.result.id],
      archived: false,
      rowVersion: 1,
      access: 'accessible',
      accessReason: 'it is money in the bank',
      accessUntil: null,
      accessBasis: {
        via: 'default',
        pack: 'generic',
        pack_version: 1,
        question: null,
        answer: null,
      },
    });
    expect(write.events).toEqual([
      { name: 'holding_created', props: { source: 'web', via: 'form' } },
      { name: 'value_recorded', props: { source: 'web' } },
    ]);
    const detail = await suite.as(userId).read((l) => l.getHolding(write.result.id));
    expect(detail.values.items).toEqual([
      like({
        date: '2026-07-15',
        amountMinor: 125_050,
        currency: 'USD',
        baseMinor: 125_050,
        fxSource: 'same',
        fxRate: '1',
        source: 'web',
        clientName: null,
        batchId: null,
      }),
    ]);
    const audits = (await auditRows(suite, userId)).slice(-2);
    expect(audits.map((a) => [a.entity, a.action])).toEqual([
      ['holding', 'create'],
      ['value', 'create'],
    ]);
  });

  it('defaults the opening date to the user’s today, in their time zone', async () => {
    const userId = await suite.newUser('USD');
    // 2026-08-01T10:00Z is already 2 August in a zone 14 hours ahead.
    const ahead = await db.withUserOn(db.app, suite.clock.now)(
      userId,
      USER,
      (tx) => {
        const l = openLedger(tx, suite.options('qz', { timeZone: 'Pacific/Kiritimati' }));
        return l.createHolding({
          name: 'Wallet',
          kind: 'asset',
          universal: 'cash',
          currency: 'USD',
          opening: { amount: 20 },
        });
      },
      { write: true },
    );
    const [value] = await suite.rows<{ date: string }>(
      `select date::text from ledger.value where user_id = $1 and holding_id = $2`,
      [userId, ahead.result.id],
    );
    expect(value?.date).toBe('2026-08-02');
  });

  it('takes a universal type for the user’s plain type of it, and as an agent fires source agent', async () => {
    const userId = await suite.newUser('USD');
    const connection = await suite.connect(userId);
    const write = await suite.as(userId, agentActor(connection)).write((l) =>
      l.createHolding({
        name: 'Index fund',
        kind: 'asset',
        universal: 'listed',
        currency: 'EUR',
      }),
    );
    expect(write.result.typeId).toBe(await suite.typeId(userId, 'listed'));
    expect(write.events).toEqual([{ name: 'holding_created', props: { source: 'agent' } }]);
  });

  it('creates the plain type when the user has none of that universal type', async () => {
    const userId = await suite.newUser('USD');
    const crypto = await suite.typeId(userId, 'crypto');
    await suite.as(userId).write((l) => l.deleteType(crypto));
    const write = await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Coins', kind: 'asset', universal: 'crypto', currency: 'USD' }),
      );
    const [type] = await suite.rows<{ universal: string; custom_name: string | null }>(
      'select universal, custom_name from ledger.user_type where user_id = $1 and id = $2',
      [userId, write.result.typeId],
    );
    expect(type).toEqual({ universal: 'crypto', custom_name: null });
    expect((await auditRows(suite, userId)).slice(-2).map((a) => a.entity)).toEqual([
      'type',
      'holding',
    ]);
  });

  it('rejects bad input naming each field, and writes nothing', async () => {
    const userId = await suite.newUser('USD');
    const counts = await rowCounts(suite, userId);
    const cash = await suite.typeId(userId, 'cash');
    const error = await appError(
      suite.as(userId).write((l) =>
        l.createHolding({
          name: 'x'.repeat(121),
          kind: 'asset',
          typeId: cash,
          currency: 'USD',
          tagIds: Array.from({ length: 21 }, (_, i) => `tag_${i}`),
          colour: 'red',
        } as never),
      ),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(error.details?.fields ?? {}).sort()).toEqual(['colour', 'name', 'tagIds']);
    expect(await rowCounts(suite, userId)).toEqual(counts);
  });

  it.each([
    [
      'both typeId and universal',
      { typeId: 'typ_x', universal: 'cash' },
      'VALIDATION_FAILED',
      'typeId',
    ],
    ['neither typeId nor universal', {}, 'VALIDATION_FAILED', 'typeId'],
    ['an unknown type', { typeId: 'typ_01K1G4KX00ZZZZZZZZZZZZZZZZ' }, 'NOT_FOUND', 'typeId'],
    [
      'a currency not in circulation',
      { universal: 'cash', currency: 'XYZ' },
      'CURRENCY_UNSUPPORTED',
      'currency',
    ],
    [
      'too many decimals',
      { universal: 'cash', opening: { amount: '1.234' } },
      'OUT_OF_RANGE',
      'opening.amount',
    ],
    [
      'a date two days ahead',
      { universal: 'cash', opening: { amount: 1, date: '2026-08-03' } },
      'OUT_OF_RANGE',
      'opening.date',
    ],
    [
      'an answer for a liability',
      { universal: 'loan', kind: 'liability', access: 'now' },
      'VALIDATION_FAILED',
      'access',
    ],
    [
      'an answer the question does not have',
      { universal: 'property', access: 'maybe' },
      'VALIDATION_FAILED',
      'access',
    ],
    [
      'an unknown tag',
      { universal: 'cash', tagIds: ['tag_01K1G4KX00ZZZZZZZZZZZZZZZZ'] },
      'NOT_FOUND',
      'tagIds[0]',
    ],
  ])('rejects %s', async (_, fields, code, path) => {
    const userId = await suite.newUser('USD');
    const error = await appError(
      suite.as(userId).write((l) =>
        l.createHolding({
          name: 'Something',
          kind: 'asset',
          currency: 'USD',
          ...fields,
        } as never),
      ),
    );
    expect(error.code).toBe(code);
    expect(error.details?.fields).toHaveProperty([path]);
    expect(error.message).toContain(path);
  });

  it('names the answers that fit when an answer does not', async () => {
    const userId = await suite.newUser('USD');
    const error = await appError(
      suite.as(userId).write((l) =>
        l.createHolding({
          name: 'Flat',
          kind: 'asset',
          universal: 'property',
          currency: 'USD',
          access: 'now',
        }),
      ),
    );
    expect(error.details?.fields?.access).toBe(
      '"now" does not answer "Do you live in it?" Use one of "home", "let", "not_sure".',
    );
  });
});

describe('accessibility', () => {
  it.each([
    [
      'a default',
      'cash',
      undefined,
      {
        access: 'accessible',
        accessReason: 'it is money in the bank',
        accessUntil: null,
        accessBasis: {
          via: 'default',
          pack: 'generic',
          pack_version: 1,
          question: null,
          answer: null,
        },
      },
    ],
    [
      'the country pack’s default',
      'wrapper',
      undefined,
      {
        access: 'locked',
        accessReason: 'the scheme keeps it until you retire',
        accessBasis: { via: 'default', pack: 'qz', pack_version: 1, question: null, answer: null },
      },
    ],
    [
      'an answer to the type’s question',
      'property',
      'home',
      {
        access: 'locked',
        accessReason: 'it is your home',
        accessUntil: 'while you live in it',
        accessBasis: {
          via: 'answer',
          pack: 'generic',
          pack_version: 1,
          question: 'property',
          answer: 'home',
        },
      },
    ],
    [
      'the country pack’s question',
      'equity',
      'unvested',
      {
        access: 'locked',
        accessReason: 'it has not vested',
        accessUntil: 'until it vests',
        accessBasis: {
          via: 'answer',
          pack: 'qz',
          pack_version: 1,
          question: 'equity',
          answer: 'unvested',
        },
      },
    ],
    [
      'an override of a default',
      'cash',
      'tied',
      {
        access: 'locked',
        accessReason: 'you said it is tied up',
        accessBasis: {
          via: 'answer',
          pack: 'generic',
          pack_version: 1,
          question: 'other',
          answer: 'tied',
        },
      },
    ],
    [
      '"not sure"',
      'property',
      'not_sure',
      {
        access: 'undecided',
        accessReason: null,
        accessUntil: null,
        accessBasis: {
          via: 'undecided',
          pack: 'generic',
          pack_version: 1,
          question: 'property',
          answer: 'not_sure',
        },
      },
    ],
    [
      'no answer to a question',
      'property',
      undefined,
      {
        access: 'undecided',
        accessReason: null,
        accessBasis: {
          via: 'undecided',
          pack: 'generic',
          pack_version: 1,
          question: 'property',
          answer: null,
        },
      },
    ],
  ] as const)('is written at create from %s', async (_, universal, access, expected) => {
    const userId = await suite.newUser('USD');
    const write = await suite.as(userId).write((l) =>
      l.createHolding({
        name: `A ${universal}`,
        kind: 'asset',
        universal,
        currency: 'USD',
        ...(access === undefined ? {} : { access }),
      }),
    );
    expect(write.result).toMatchObject(expected);
    const [row] = await suite.rows(
      `select access, access_reason, access_until, access_basis from ledger.holding where user_id = $1 and id = $2`,
      [userId, write.result.id],
    );
    expect(row).toEqual({
      access: write.result.access,
      access_reason: write.result.accessReason,
      access_until: write.result.accessUntil,
      access_basis: write.result.accessBasis,
    });
  });

  it('is written again on a new answer, with the pack version then live, and back to the default on null', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Flat',
        kind: 'asset',
        universal: 'property',
        currency: 'USD',
        access: 'not_sure',
      }),
    );
    suite.content.publish({
      ...GENERIC_V1,
      version: 2,
      questions: {
        ...GENERIC_V1.questions,
        property: {
          ask: 'Do you live in it?',
          answers: [
            { id: 'home', label: 'Yes', access: 'locked', reason: 'it is where you live' },
            { id: 'let', label: 'No', access: 'illiquid', reason: 'you would have to sell it' },
          ],
        },
      },
    });
    const answered = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { access: 'let' }));
    expect(answered.result).toMatchObject({
      access: 'illiquid',
      accessReason: 'you would have to sell it',
      accessUntil: null,
      accessBasis: {
        via: 'answer',
        pack: 'generic',
        pack_version: 2,
        question: 'property',
        answer: 'let',
      },
      rowVersion: 2,
    });
    const reset = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { access: null }));
    expect(reset.result).toMatchObject({
      access: 'undecided',
      accessBasis: { via: 'undecided', answer: null },
    });
  });

  it('is left as applied when a later pack version changes the outcome', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Pension', kind: 'asset', universal: 'wrapper', currency: 'USD' }),
      );
    suite.content.publish({
      ...COUNTRY_V1,
      version: 2,
      defaults: { wrapper: { access: 'illiquid', reason: 'you can sell the units' } },
    });
    const after = await suite.as(userId).read((l) => l.getHolding(created.result.id));
    expect(after).toMatchObject({
      access: 'locked',
      accessReason: 'the scheme keeps it until you retire',
      accessBasis: { via: 'default', pack: 'qz', pack_version: 1 },
    });
    const snapshot = await suite.as(userId).read((l) => l.snapshot());
    expect(snapshot.packRef).toEqual([
      { key: 'qz', version: 2 },
      { key: 'generic', version: suite.content.ref(null)[0]!.version },
    ]);
    expect(snapshot.holdings.find((h) => h.id === created.result.id)?.access).toBe('locked');
    // A rename does not re-apply it either.
    const renamed = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { name: 'Old pension' }));
    expect(renamed.result.accessBasis).toMatchObject({ pack: 'qz', pack_version: 1 });
  });

  it('is resolved again when the holding moves to another universal type, carrying an answer to the same question', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Savings',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        access: 'sell',
      }),
    );
    const vehicle = await suite.typeId(userId, 'vehicle');
    const moved = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { typeId: vehicle }));
    expect(moved.result).toMatchObject({
      typeId: vehicle,
      access: 'illiquid',
      accessReason: 'you would sell it',
      accessBasis: { via: 'answer', question: 'other', answer: 'sell' },
    });
    const property = await suite.typeId(userId, 'property');
    const again = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { typeId: property }));
    expect(again.result).toMatchObject({
      access: 'undecided',
      accessBasis: { question: 'property', answer: null },
    });
  });

  it('gives a liability none', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Car loan',
        kind: 'liability',
        universal: 'loan',
        currency: 'USD',
      }),
    );
    expect(created.result).toMatchObject({ access: null, accessReason: null, accessBasis: null });
    const error = await appError(
      suite.as(userId).write((l) => l.updateHolding(created.result.id, { access: 'now' })),
    );
    expect(error.details?.fields).toHaveProperty('access');
  });
});

describe('likely duplicates', () => {
  it('refuses a similar holding with at most three candidates, and allowDuplicate creates it', async () => {
    const userId = await suite.newUser('USD');
    const ids: string[] = [];
    for (const name of [
      'Everyday account',
      'Everyday account 2',
      'Everyday acct',
      'Everyday accounts',
    ]) {
      const w = await suite.as(userId).write((l) =>
        l.createHolding({
          name,
          kind: 'asset',
          universal: 'cash',
          currency: 'USD',
          allowDuplicate: true,
        }),
      );
      ids.push(w.result.id);
    }
    await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId: ids[0]!, amount: '10.00', date: '2026-07-31' }]));
    const counts = await rowCounts(suite, userId);
    const error = await appError(
      suite.as(userId).write((l) =>
        l.createHolding({
          name: 'everyday ACCOUNT',
          kind: 'asset',
          universal: 'cash',
          currency: 'USD',
        }),
      ),
    );
    expect(error.code).toBe('LIKELY_DUPLICATE');
    const candidates = error.details?.candidates as { id: string; name: string; latest: unknown }[];
    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toEqual({
      id: ids[0],
      name: 'Everyday account',
      latest: { date: '2026-07-31', amountMinor: 1000, currency: 'USD' },
    });
    expect(await rowCounts(suite, userId)).toEqual(counts);

    // Another kind, currency or universal type is not a duplicate.
    await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Everyday account',
        kind: 'asset',
        universal: 'cash',
        currency: 'EUR',
      }),
    );
    const forced = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'everyday ACCOUNT',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        allowDuplicate: true,
      }),
    );
    expect(forced.result.name).toBe('everyday ACCOUNT');
  });
});

describe('updateHolding', () => {
  it('renames, retags, sets cadence, archives and unarchives, with an audit row each time', async () => {
    const userId = await suite.newUser('USD');
    const tagA = (await suite.as(userId).write((l) => l.upsertTag({ name: 'A' }))).result.id;
    const tagB = (await suite.as(userId).write((l) => l.upsertTag({ name: 'B' }))).result.id;
    const created = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Brokerage',
        kind: 'asset',
        universal: 'listed',
        currency: 'USD',
        tagIds: [tagA],
      }),
    );
    const id = created.result.id;
    const updated = await suite.as(userId).write((l) =>
      l.updateHolding(id, {
        name: 'Brokerage account',
        tagIds: [tagB, tagA, tagB],
        cadenceDays: 7,
      }),
    );
    expect(updated.result).toMatchObject({
      name: 'Brokerage account',
      tagIds: [tagA, tagB].sort(),
      cadenceDays: 7,
      rowVersion: 2,
    });
    const archived = await suite.as(userId).write((l) => l.updateHolding(id, { archived: true }));
    expect(archived.result).toMatchObject({
      archived: true,
      archivedAt: suite.clock.now().toISOString(),
      rowVersion: 3,
    });
    const again = await suite.as(userId).write((l) => l.updateHolding(id, { archived: true }));
    expect(again.dataVersion).toBe(archived.dataVersion);
    const back = await suite
      .as(userId)
      .write((l) => l.updateHolding(id, { archived: false, cadenceDays: null, tagIds: [] }));
    expect(back.result).toMatchObject({
      archived: false,
      archivedAt: null,
      cadenceDays: null,
      tagIds: [],
      rowVersion: 4,
    });
    const audits = (await auditRows(suite, userId)).filter((a) => a.entity_id === id);
    expect(audits.map((a) => a.action)).toEqual(['create', 'update', 'update', 'update']);
    expect(audits[1]?.before).toMatchObject({ name: 'Brokerage', rowVersion: 1, tagIds: [tagA] });
    expect(audits[1]?.after).toMatchObject({ name: 'Brokerage account', rowVersion: 2 });
    const [links] = await suite.rows<{ n: number }>(
      'select count(*)::int as n from ledger.holding_tag where user_id = $1 and holding_id = $2',
      [userId, id],
    );
    expect(links?.n).toBe(0);
  });

  it('changes nothing, and writes nothing, for a patch that changes nothing', async () => {
    const userId = await suite.newUser('USD');
    const created = await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'Same', kind: 'asset', universal: 'cash', currency: 'USD' }),
      );
    const counts = await rowCounts(suite, userId);
    const write = await suite
      .as(userId)
      .write((l) => l.updateHolding(created.result.id, { name: 'Same' }));
    expect(write.dataVersion).toBe(created.dataVersion);
    expect(await rowCounts(suite, userId)).toEqual(counts);
  });

  it('is NOT_FOUND for an unknown holding or type', async () => {
    const userId = await suite.newUser('USD');
    expect(
      (await appError(suite.as(userId).write((l) => l.updateHolding('hld_nope', { name: 'X' }))))
        .code,
    ).toBe('NOT_FOUND');
    const created = await suite
      .as(userId)
      .write((l) =>
        l.createHolding({ name: 'H', kind: 'asset', universal: 'cash', currency: 'USD' }),
      );
    const error = await appError(
      suite.as(userId).write((l) => l.updateHolding(created.result.id, { typeId: 'typ_nope' })),
    );
    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      details: { fields: { typeId: anyString } },
    });
  });
});

describe('deleteHolding', () => {
  it('deletes the holding, its values and tags; its audit row keeps them all', async () => {
    const userId = await suite.newUser('USD');
    const tagId = (await suite.as(userId).write((l) => l.upsertTag({ name: 'Gone' }))).result.id;
    const created = await suite.as(userId).write((l) =>
      l.createHolding({
        name: 'Old account',
        kind: 'asset',
        universal: 'cash',
        currency: 'USD',
        tagIds: [tagId],
        opening: { amount: '5.00', date: '2026-06-30' },
      }),
    );
    const id = created.result.id;
    await suite
      .as(userId)
      .write((l) => l.recordValues([{ holdingId: id, amount: '6.00', date: '2026-07-31' }]));
    await suite.as(userId).write((l) => l.setPrefs({ insightsFilter: { hideHoldingIds: [id] } }));
    const values = await suite.as(userId).read((l) => l.getHolding(id));
    const write = await suite.as(userId).write((l) => l.deleteHolding(id));
    expect(write.result).toBeUndefined();
    const [counts] = await suite.rows<{ h: number; v: number; t: number }>(
      `select (select count(*)::int from ledger.holding where user_id = $1 and id = $2) as h,
              (select count(*)::int from ledger.value where user_id = $1 and holding_id = $2) as v,
              (select count(*)::int from ledger.holding_tag where user_id = $1 and holding_id = $2) as t`,
      [userId, id],
    );
    expect(counts).toEqual({ h: 0, v: 0, t: 0 });
    const audits = (await auditRows(suite, userId)).slice(-2);
    expect(audits[0]).toMatchObject({
      entity: 'holding',
      entity_id: id,
      action: 'delete',
      after: null,
    });
    const before = audits[0]?.before as {
      name: string;
      tagIds: string[];
      values: { id: string }[];
    };
    expect(before).toMatchObject({ name: 'Old account', tagIds: [tagId], rowVersion: 1 });
    expect(before.values).toEqual([...values.values.items].reverse());
    // Saved filters let go of it.
    expect(audits[1]).toMatchObject({
      entity: 'prefs',
      action: 'update',
      after: { value: { hideHoldingIds: [] } },
    });
  });

  it('is NOT_FOUND for an unknown holding', async () => {
    const userId = await suite.newUser('USD');
    expect((await appError(suite.as(userId).write((l) => l.deleteHolding('hld_nope')))).code).toBe(
      'NOT_FOUND',
    );
  });
});
