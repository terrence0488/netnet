import { describe, expect, it } from 'vitest';
import {
  describeHomeFilter,
  isFilterActive,
  normalizeFilter,
  setTriState,
  triState,
} from './filtering';

const LABELS = {
  types: new Map([
    ['typ_cash', 'Cash & savings'],
    ['typ_prop', 'Property'],
  ]),
  tags: new Map([['tag_old', 'Groceries']]),
};

describe('isFilterActive', () => {
  it('is idle for the default and for empty lists', () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ show: 'all', typeIds: [], hideTagIds: [] })).toBe(false);
    expect(isFilterActive({ includeArchived: false })).toBe(false);
  });

  it('is active for a show, a show-only, a hiding, or archived inclusion', () => {
    expect(isFilterActive({ show: 'assets' })).toBe(true);
    expect(isFilterActive({ typeIds: ['typ_cash'] })).toBe(true);
    expect(isFilterActive({ hideTagIds: ['tag_old'] })).toBe(true);
    expect(isFilterActive({ includeArchived: true })).toBe(true);
  });
});

describe('normalizeFilter', () => {
  it('drops the default show and the empty lists', () => {
    expect(normalizeFilter({ show: 'all', typeIds: [], tagMode: 'all' })).toStrictEqual({});
    expect(
      normalizeFilter({ show: 'assets', typeIds: ['typ_cash'], hideTagIds: [] }),
    ).toStrictEqual({
      show: 'assets',
      typeIds: ['typ_cash'],
    });
  });

  it('keeps archived inclusion only when it is on', () => {
    expect(normalizeFilter({ includeArchived: true })).toStrictEqual({ includeArchived: true });
    expect(normalizeFilter({ includeArchived: false })).toStrictEqual({});
  });
});

describe('triState', () => {
  it('reads shown-only, hidden, and neither', () => {
    const filter = { typeIds: ['typ_cash'], hideTagIds: ['tag_old'] };
    expect(triState(filter, 'type', 'typ_cash')).toBe('only');
    expect(triState(filter, 'tag', 'tag_old')).toBe('hide');
    expect(triState(filter, 'type', 'typ_prop')).toBe('off');
  });

  it('never leaves a type shown-only and hidden at once', () => {
    const only = setTriState({}, 'type', 'typ_cash', 'only');
    expect(only).toStrictEqual({ typeIds: ['typ_cash'] });
    const hidden = setTriState(only, 'type', 'typ_cash', 'hide');
    expect(hidden).toStrictEqual({ hideTypeIds: ['typ_cash'] });
    expect(setTriState(hidden, 'type', 'typ_cash', 'off')).toStrictEqual({});
  });

  it('keeps the other lists untouched', () => {
    const filter = setTriState({ show: 'assets', tagIds: ['tag_old'] }, 'type', 'typ_cash', 'hide');
    expect(filter).toStrictEqual({
      show: 'assets',
      tagIds: ['tag_old'],
      hideTypeIds: ['typ_cash'],
    });
  });
});

describe('describeHomeFilter', () => {
  it('names the show and what is hidden', () => {
    expect(
      describeHomeFilter(
        { show: 'assets', hideTypeIds: ['typ_prop'], hideTagIds: ['tag_old'] },
        LABELS,
      ),
    ).toBe('Assets only · hiding Property · hiding Groceries');
  });

  it('names show-only types and tags, tags with their match', () => {
    expect(describeHomeFilter({ typeIds: ['typ_cash'], tagIds: ['tag_old'] }, LABELS)).toBe(
      'Cash & savings · Groceries',
    );
    expect(
      describeHomeFilter(
        { tagIds: ['tag_old', 'tag_shared'], tagMode: 'all' },
        {
          types: LABELS.types,
          tags: new Map([
            ['tag_old', 'Groceries'],
            ['tag_shared', 'Shared'],
          ]),
        },
      ),
    ).toBe('Groceries AND Shared');
  });

  it('names archived inclusion', () => {
    expect(describeHomeFilter({ includeArchived: true }, LABELS)).toBe('including archived');
  });

  it('leaves out what Home no longer knows', () => {
    expect(describeHomeFilter({ hideTypeIds: ['typ_gone'] }, LABELS)).toBe('');
  });
});
