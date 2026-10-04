import { describe, expect, it } from 'vitest';
import { filterHoldings } from './filter';
import { holding, liability } from './testing/fixtures';

const holdings = [
  holding('a', { typeId: 'typ_cash', tagIds: ['tag_joint'] }),
  holding('b', { typeId: 'typ_listed', tagIds: ['tag_joint', 'tag_kids'] }),
  holding('c', { typeId: 'typ_listed', tagIds: [] }),
  holding('d', { typeId: 'typ_cash', archived: true }),
  liability('e', { tagIds: ['tag_kids'] }),
];
const ids = (filter?: Parameters<typeof filterHoldings>[1]) =>
  filterHoldings(holdings, filter).map((h) => h.id);

describe('filterHoldings', () => {
  it('always leaves archived holdings out', () => {
    expect(ids()).toStrictEqual(['a', 'b', 'c', 'e']);
    expect(ids({ typeIds: ['typ_cash'] })).toStrictEqual(['a']);
  });

  it('shows only assets or only liabilities', () => {
    expect(ids({ show: 'all' })).toStrictEqual(['a', 'b', 'c', 'e']);
    expect(ids({ show: 'assets' })).toStrictEqual(['a', 'b', 'c']);
    expect(ids({ show: 'liabilities' })).toStrictEqual(['e']);
  });

  it('shows only some types, or only holdings with any or all of some tags', () => {
    expect(ids({ typeIds: ['typ_listed', 'typ_loan'] })).toStrictEqual(['b', 'c', 'e']);
    expect(ids({ tagIds: ['tag_joint', 'tag_kids'] })).toStrictEqual(['a', 'b', 'e']);
    expect(ids({ tagIds: ['tag_joint', 'tag_kids'], tagMode: 'all' })).toStrictEqual(['b']);
    expect(ids({ typeIds: ['typ_listed'], tagIds: ['tag_joint'] })).toStrictEqual(['b']);
  });

  it("doesn't show some types, holdings with some tags, or some holdings", () => {
    expect(ids({ hideTypeIds: ['typ_listed'] })).toStrictEqual(['a', 'e']);
    expect(ids({ hideTagIds: ['tag_joint', 'tag_kids'] })).toStrictEqual(['c']);
    expect(ids({ hideTagIds: ['tag_joint', 'tag_kids'], hideTagMode: 'all' })).toStrictEqual([
      'a',
      'c',
      'e',
    ]);
    expect(ids({ hideHoldingIds: ['a', 'e'] })).toStrictEqual(['b', 'c']);
  });

  it('restricts nothing with empty lists', () => {
    expect(
      ids({ typeIds: [], tagIds: [], hideTypeIds: [], hideTagIds: [], hideHoldingIds: [] }),
    ).toStrictEqual(['a', 'b', 'c', 'e']);
  });
});
