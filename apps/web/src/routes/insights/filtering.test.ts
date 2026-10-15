import type {
  HoldingIn as ContractHoldingIn,
  SavedExclusions,
  SavedFilter,
} from '@netnet/contracts';
import { filterHoldings } from '@netnet/core';
import { describe, expect, it } from 'vitest';
import {
  countedFilter,
  describeExclusions,
  describeInsightsFilter,
  isExclusionsActive,
  isInsightsFilterActive,
  normalizeExclusions,
  normalizeInsightsFilter,
  setTriState,
  toggleExcludedHolding,
  triState,
} from './filtering';

const LABELS = {
  types: new Map([
    ['typ_cash', 'Cash'],
    ['typ_listed', 'Listed'],
  ]),
  tags: new Map([
    ['tag_rainy', 'Rainy day'],
    ['tag_shared', 'Shared'],
  ]),
  holdings: new Map([['hld_cash', 'Everyday savings']]),
};

function holding(over: Partial<ContractHoldingIn>): ContractHoldingIn {
  return {
    id: 'hld_1',
    name: 'Holding',
    kind: 'asset',
    typeId: 'typ_cash',
    universal: 'cash',
    currency: 'SGD',
    cadenceDays: null,
    archived: false,
    access: 'accessible',
    tagIds: [],
    ...over,
  };
}

describe('activity', () => {
  it('is idle with empty lists', () => {
    expect(isInsightsFilterActive({})).toBe(false);
    expect(isInsightsFilterActive({ typeIds: [], tagIds: [] })).toBe(false);
    expect(isExclusionsActive({})).toBe(false);
    expect(isExclusionsActive({ holdingIds: [], typeIds: [], tagIds: [] })).toBe(false);
  });

  it('is active when anything is kept or dropped', () => {
    expect(isInsightsFilterActive({ typeIds: ['typ_cash'] })).toBe(true);
    expect(isInsightsFilterActive({ tagIds: ['tag_rainy'] })).toBe(true);
    expect(isExclusionsActive({ holdingIds: ['hld_cash'] })).toBe(true);
    expect(isExclusionsActive({ typeIds: ['typ_cash'] })).toBe(true);
    expect(isExclusionsActive({ tagIds: ['tag_rainy'] })).toBe(true);
  });
});

describe('normalizing', () => {
  it('drops the empty lists and keeps the tag match with its tags', () => {
    expect(
      normalizeInsightsFilter({ typeIds: [], tagIds: ['tag_rainy'], tagMode: 'all' }),
    ).toStrictEqual({ tagIds: ['tag_rainy'], tagMode: 'all' });
    expect(normalizeInsightsFilter({ tagMode: 'all' })).toStrictEqual({});
    expect(normalizeExclusions({ holdingIds: [], typeIds: ['typ_cash'] })).toStrictEqual({
      typeIds: ['typ_cash'],
    });
  });
});

describe('describing', () => {
  it('names what the filter keeps, with the tags’ match', () => {
    expect(
      describeInsightsFilter(
        { typeIds: ['typ_cash', 'typ_listed'], tagIds: ['tag_rainy', 'tag_shared'] },
        LABELS,
      ),
    ).toBe('Cash, Listed · Rainy day OR Shared');
    expect(
      describeInsightsFilter({ tagIds: ['tag_rainy', 'tag_shared'], tagMode: 'all' }, LABELS),
    ).toBe('Rainy day AND Shared');
  });

  it('names every holding, type and tag the Don’t Show list drops', () => {
    expect(
      describeExclusions(
        { holdingIds: ['hld_cash'], typeIds: ['typ_listed'], tagIds: ['tag_rainy'] },
        LABELS,
      ),
    ).toBe('Everyday savings, Listed, Rainy day');
  });

  it('leaves out what Insights no longer knows', () => {
    expect(describeInsightsFilter({ typeIds: ['typ_gone'] }, LABELS)).toBe('');
    expect(describeExclusions({ holdingIds: ['hld_gone'] }, LABELS)).toBe('');
  });
});

describe('tri-state', () => {
  const filter: SavedFilter = { typeIds: ['typ_cash'] };
  const exclusions: SavedExclusions = { typeIds: ['typ_listed'], tagIds: ['tag_rainy'] };

  it('reads shown-only, hidden, or neither', () => {
    expect(triState(filter, exclusions, 'type', 'typ_cash')).toBe('only');
    expect(triState(filter, exclusions, 'type', 'typ_listed')).toBe('hide');
    expect(triState(filter, exclusions, 'tag', 'tag_rainy')).toBe('hide');
    expect(triState(filter, exclusions, 'tag', 'tag_shared')).toBe('off');
  });

  it('never leaves a type shown-only and hidden at once', () => {
    const draft = setTriState({ filter, exclusions }, 'type', 'typ_cash', 'hide');
    expect(draft.filter).toStrictEqual({});
    expect(draft.exclusions.typeIds).toStrictEqual(['typ_listed', 'typ_cash']);
  });

  it('toggles holdings in and out of the Don’t Show list', () => {
    const added = toggleExcludedHolding({}, 'hld_cash');
    expect(added).toStrictEqual({ holdingIds: ['hld_cash'] });
    expect(toggleExcludedHolding(added, 'hld_cash')).toStrictEqual({});
  });
});

describe('countedFilter', () => {
  const holdings = [
    holding({ id: 'hld_cash', typeId: 'typ_cash', tagIds: ['tag_rainy'] }),
    holding({ id: 'hld_broker', typeId: 'typ_listed', tagIds: ['tag_shared'] }),
  ];

  it('keeps the show-only keys and drops the Don’t Show list', () => {
    const counted = countedFilter(
      { typeIds: ['typ_cash', 'typ_listed'] },
      { tagIds: ['tag_rainy'] },
    );
    expect(filterHoldings(holdings, counted).map((h: ContractHoldingIn) => h.id)).toStrictEqual([
      'hld_broker',
    ]);
  });

  it('drops a holding with any listed tag', () => {
    const counted = countedFilter({}, { tagIds: ['tag_shared'] });
    expect(filterHoldings(holdings, counted).map((h: ContractHoldingIn) => h.id)).toStrictEqual([
      'hld_cash',
    ]);
  });
});
