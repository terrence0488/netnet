import { describe, expect, it } from 'vitest';
import {
  DOMAIN_EVENT_NAMES,
  HOLDING_SORTS,
  MAX_NAME_LENGTH,
  MAX_TAGS_PER_HOLDING,
  MAX_VALUES_PER_CALL,
  PREF_KEYS,
  VALUE_FX_SOURCES,
  WARNING_CODES,
  accessAnswerSchema,
  createHoldingSchema,
  historyQuerySchema,
  holdingFilterSchema,
  holdingPatchSchema,
  holdingQuerySchema,
  newValueSchema,
  newValuesSchema,
  packRefSchema,
  pageReqSchema,
  prefsPatchSchema,
  tagInputSchema,
  typeInputSchema,
  valuePatchSchema,
} from './ledger';

/** The paths of a failed parse's issues, as the Ledger reports them. */
function paths(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; code: string; keys?: string[] }[] };
}) {
  if (result.success) return [];
  return (result.error?.issues ?? []).flatMap((i) =>
    i.code === 'unrecognized_keys'
      ? (i.keys ?? []).map((k) => [...i.path, k].join('.'))
      : [i.path.join('.')],
  );
}

describe('vocabularies and limits', () => {
  it('match architecture §6.3, §7.2, §7.4 and PRD J6', () => {
    expect([MAX_NAME_LENGTH, MAX_TAGS_PER_HOLDING, MAX_VALUES_PER_CALL]).toEqual([120, 20, 200]);
    expect(VALUE_FX_SOURCES).toEqual(['ecb', 'fallback', 'same', 'user', 'agent']);
    expect(WARNING_CODES).toEqual(['SAME_DATE_REPLACED']);
    expect(DOMAIN_EVENT_NAMES).toEqual(['holding_created', 'value_recorded', 'value_corrected']);
    expect(PREF_KEYS).toEqual(['homeFilter', 'insightsFilter', 'baseline', 'sort']);
    expect(HOLDING_SORTS).toContain('value_desc');
  });
});

describe('createHoldingSchema', () => {
  const valid = { name: 'Everyday account', kind: 'asset', typeId: 'typ_1', currency: 'USD' };

  it('accepts a holding with a type id or a universal type, and trims and raises what it should', () => {
    expect(
      createHoldingSchema.parse({ ...valid, name: ' Everyday account ', currency: 'usd' }),
    ).toEqual(valid);
    expect(
      createHoldingSchema.safeParse({
        name: 'Flat',
        kind: 'asset',
        universal: 'property',
        currency: 'EUR',
        tagIds: ['tag_1'],
        access: 'not_sure',
        opening: { amount: '250000.00', date: '2026-07-31', fxRate: 1.1 },
        via: 'guided',
        allowDuplicate: false,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a blank name', { name: '  ' }, 'name'],
    ['a name over 120 characters', { name: 'x'.repeat(121) }, 'name'],
    ['an unknown kind', { kind: 'debt' }, 'kind'],
    ['a currency that is not three letters', { currency: 'US' }, 'currency'],
    ['both a type id and a universal type', { universal: 'cash' }, 'typeId'],
    ['more than 20 tags', { tagIds: Array.from({ length: 21 }, (_, i) => `tag_${i}`) }, 'tagIds'],
    ['an answer that is not an id', { access: 'Not sure' }, 'access'],
    [
      'an amount that is neither text nor a number',
      { opening: { amount: true } },
      'opening.amount',
    ],
    [
      'an opening date that is not a date',
      { opening: { amount: 1, date: '31/07/2026' } },
      'opening.date',
    ],
    ['a zero rate', { opening: { amount: 1, fxRate: '0' } }, 'opening.fxRate'],
    ['an unknown via', { via: 'agent' }, 'via'],
    ['an unknown field', { notes: 'x' }, 'notes'],
  ])('rejects %s', (_, change, path) => {
    expect(paths(createHoldingSchema.safeParse({ ...valid, ...change }))).toContain(path);
  });

  it('rejects a holding with no type', () => {
    expect(
      paths(createHoldingSchema.safeParse({ name: 'X', kind: 'asset', currency: 'USD' })),
    ).toEqual(['typeId']);
  });
});

describe('accessAnswerSchema', () => {
  it('is an answer id or "not_sure"', () => {
    expect(accessAnswerSchema.safeParse('not_sure').success).toBe(true);
    expect(accessAnswerSchema.safeParse('unvested').success).toBe(true);
    expect(accessAnswerSchema.safeParse('Not sure').success).toBe(false);
    expect(accessAnswerSchema.safeParse('').success).toBe(false);
  });
});

describe('holdingPatchSchema', () => {
  it('accepts any subset, with nulls where a field goes back to its default', () => {
    expect(holdingPatchSchema.safeParse({}).success).toBe(true);
    expect(
      holdingPatchSchema.safeParse({
        name: 'X',
        typeId: 'typ_1',
        tagIds: [],
        access: null,
        cadenceDays: null,
        archived: true,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a cadence of 0 days', { cadenceDays: 0 }, 'cadenceDays'],
    ['a fractional cadence', { cadenceDays: 1.5 }, 'cadenceDays'],
    ['a kind, which never changes', { kind: 'liability' }, 'kind'],
  ])('rejects %s', (_, patch, path) => {
    expect(paths(holdingPatchSchema.safeParse(patch))).toEqual([path]);
  });
});

describe('newValueSchema and newValuesSchema', () => {
  it('accepts a value with only a holding and an amount', () => {
    expect(newValueSchema.parse({ holdingId: 'hld_1', amount: 12.5 })).toEqual({
      holdingId: 'hld_1',
      amount: 12.5,
    });
    expect(newValueSchema.parse({ holdingId: 'hld_1', amount: '1', fxRate: 0.25 }).fxRate).toBe(
      '0.25',
    );
  });

  it.each([
    ['a missing holding', { amount: 1 }, 'holdingId'],
    ['a 30 February', { holdingId: 'hld_1', amount: 1, date: '2026-02-30' }, 'date'],
    ['a rate in exponent notation', { holdingId: 'hld_1', amount: 1, fxRate: 1e-7 }, 'fxRate'],
    ['a negative rate', { holdingId: 'hld_1', amount: 1, fxRate: '-1.2' }, 'fxRate'],
  ])('rejects %s', (_, value, path) => {
    expect(paths(newValueSchema.safeParse(value))).toEqual([path]);
  });

  it('takes 1 to 200 values', () => {
    const value = { holdingId: 'hld_1', amount: 1 };
    expect(newValuesSchema.safeParse([value]).success).toBe(true);
    expect(newValuesSchema.safeParse(Array.from({ length: 200 }, () => value)).success).toBe(true);
    expect(paths(newValuesSchema.safeParse([]))).toEqual(['']);
    expect(paths(newValuesSchema.safeParse(Array.from({ length: 201 }, () => value)))).toEqual([
      '',
    ]);
    expect(paths(newValuesSchema.safeParse([value, { amount: 1 }]))).toEqual(['1.holdingId']);
  });
});

describe('valuePatchSchema', () => {
  it('accepts a correction, and null to drop a given rate', () => {
    expect(
      valuePatchSchema.safeParse({ amount: '1', date: '2026-07-31', currency: 'eur', fxRate: null })
        .success,
    ).toBe(true);
    expect(paths(valuePatchSchema.safeParse({ holdingId: 'hld_2' }))).toEqual(['holdingId']);
  });
});

describe('typeInputSchema and tagInputSchema', () => {
  it('needs a universal type for a new type, not for a rename', () => {
    expect(typeInputSchema.safeParse({ name: 'Art', universal: 'other' }).success).toBe(true);
    expect(typeInputSchema.safeParse({ id: 'typ_1', name: 'Art' }).success).toBe(true);
    expect(paths(typeInputSchema.safeParse({ name: 'Art' }))).toEqual(['universal']);
    expect(paths(typeInputSchema.safeParse({ name: 'Art', universal: 'art' }))).toEqual([
      'universal',
    ]);
  });

  it('needs a tag name', () => {
    expect(tagInputSchema.safeParse({ name: 'Long term' }).success).toBe(true);
    expect(paths(tagInputSchema.safeParse({ id: 'tag_1' }))).toEqual(['name']);
  });
});

describe('prefsPatchSchema and holdingFilterSchema', () => {
  it('accepts filters, a baseline, a sort, and null to clear one', () => {
    expect(
      prefsPatchSchema.safeParse({
        homeFilter: {
          show: 'assets',
          typeIds: ['typ_1'],
          tagIds: ['tag_1'],
          tagMode: 'all',
          hideTypeIds: [],
          hideTagIds: [],
          hideTagMode: 'any',
        },
        insightsFilter: { hideHoldingIds: ['hld_1'] },
        baseline: 'last_quarter',
        sort: 'change_pct',
      }).success,
    ).toBe(true);
    expect(prefsPatchSchema.safeParse({ homeFilter: null, baseline: null }).success).toBe(true);
  });

  it.each([
    ['an unknown baseline', { baseline: 'last_week' }, 'baseline'],
    ['an unknown sort', { sort: 'size' }, 'sort'],
    ['an unknown pref', { theme: 'dark' }, 'theme'],
    ['an unknown filter field', { homeFilter: { archived: true } }, 'homeFilter.archived'],
  ])('rejects %s', (_, patch, path) => {
    expect(paths(prefsPatchSchema.safeParse(patch))).toEqual([path]);
  });

  it('rejects a show that is not all, assets or liabilities', () => {
    expect(paths(holdingFilterSchema.safeParse({ show: 'archived' }))).toEqual(['show']);
  });
});

describe('queries', () => {
  it('pages values up to 500 and holdings up to 100', () => {
    expect(pageReqSchema.safeParse({ cursor: 'abc', limit: 500 }).success).toBe(true);
    expect(paths(pageReqSchema.safeParse({ limit: 501 }))).toEqual(['limit']);
    expect(
      holdingQuerySchema.safeParse({ query: 'fund', archived: 'only', staleOnly: true, limit: 100 })
        .success,
    ).toBe(true);
    expect(paths(holdingQuerySchema.safeParse({ limit: 101 }))).toEqual(['limit']);
    expect(paths(holdingQuerySchema.safeParse({ archived: 'yes' }))).toEqual(['archived']);
  });

  it('asks history for a range in order, an interval and a grouping', () => {
    expect(
      historyQuerySchema.safeParse({
        from: '2026-01-01',
        to: '2026-07-31',
        interval: 'quarter',
        groupBy: 'currency',
      }).success,
    ).toBe(true);
    expect(paths(historyQuerySchema.safeParse({ from: '2026-08-01', to: '2026-07-31' }))).toEqual([
      'from',
    ]);
    expect(paths(historyQuerySchema.safeParse({ interval: 'week' }))).toEqual(['interval']);
  });
});

describe('packRefSchema', () => {
  it('is the country’s pack (if any), then generic, at published versions', () => {
    expect(
      packRefSchema.safeParse([
        { key: 'qz', version: 2 },
        { key: 'generic', version: 5 },
      ]).success,
    ).toBe(true);
    expect(paths(packRefSchema.safeParse([]))).toEqual(['']);
    expect(paths(packRefSchema.safeParse([{ key: 'QZ', version: 0 }]))).toEqual([
      '0.key',
      '0.version',
    ]);
  });
});
