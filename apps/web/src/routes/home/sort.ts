import type { Change, HoldingIn, HoldingSort, ValueIn } from '@netnet/contracts';

/**
 * How Home lists holdings (PRD J4): value in either direction, name, type, change or last
 * updated, as added until the person chooses. `change_pct` reads the percentage, `change_value`
 * the money; both order largest first. Value sorts read signed, so a debt sits below every
 * asset high-to-low and atop low-to-high.
 */

export type HomeSort = HoldingSort | 'added';

/** Every sort Home offers, with the label the sheet and the toolbar show. */
export const SORT_OPTIONS: readonly { readonly value: HomeSort; readonly label: string }[] = [
  { value: 'added', label: 'As added' },
  { value: 'value_desc', label: 'Highest value' },
  { value: 'value_asc', label: 'Lowest value' },
  { value: 'name', label: 'Name, A to Z' },
  { value: 'type', label: 'Type, A to Z' },
  { value: 'change_value', label: 'Largest change' },
  { value: 'change_pct', label: 'Largest change, %' },
  { value: 'updated', label: 'Recently updated' },
];

/** "Highest value": the label for the sort in force. */
export function sortLabel(sort: HomeSort): string {
  return SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
}

/** A holding's signed latest total: negative for a liability, null without a value. */
function signedValue(holding: HoldingIn, latest: ReadonlyMap<string, ValueIn>): number | null {
  const value = latest.get(holding.id);
  if (!value) return null;
  return holding.kind === 'liability' ? -value.baseMinor : value.baseMinor;
}

function byName(a: HoldingIn, b: HoldingIn): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1;
}

/** Largest first, with nothing to sort by last; ties keep the order they came in. */
function descNullsLast(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

/** Smallest first, with nothing to sort by last all the same. */
function ascNullsLast(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
}

function descDatesNullsLast(a: string | undefined, b: string | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * The holdings in the person's sort. `changes` holds each row's change against the baseline in
 * force, used for display and for the change sorts alike, so the two can never disagree.
 * `typeLabel` names a type for the type sort.
 */
export function sortHoldings<H extends HoldingIn>(
  holdings: readonly H[],
  sort: HomeSort,
  latest: ReadonlyMap<string, ValueIn>,
  changes: ReadonlyMap<string, Change>,
  typeLabel: (typeId: string) => string = () => '',
): H[] {
  const rows = [...holdings];
  switch (sort) {
    case 'added':
      return rows;
    case 'name':
      return rows.sort(byName);
    case 'value_desc':
      return rows.sort((a, b) => descNullsLast(signedValue(a, latest), signedValue(b, latest)));
    case 'value_asc':
      return rows.sort((a, b) => ascNullsLast(signedValue(a, latest), signedValue(b, latest)));
    case 'type':
      return rows.sort(
        (a, b) => typeLabel(a.typeId).localeCompare(typeLabel(b.typeId)) || byName(a, b),
      );
    case 'change_value':
      return rows.sort((a, b) =>
        descNullsLast(changes.get(a.id)?.amount ?? null, changes.get(b.id)?.amount ?? null),
      );
    case 'change_pct':
      return rows.sort((a, b) =>
        descNullsLast(changes.get(a.id)?.pct ?? null, changes.get(b.id)?.pct ?? null),
      );
    case 'updated':
      return rows.sort((a, b) =>
        descDatesNullsLast(latest.get(a.id)?.date, latest.get(b.id)?.date),
      );
    default:
      // A sort the API accepts but Home offers no control for reads as added.
      return rows;
  }
}
