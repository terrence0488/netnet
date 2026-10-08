import type { Change } from '@netnet/contracts';

/**
 * Change figures on Home (design-system §2.1): one per row — the money by default, the percentage
 * when the list is sorted by it — and both on the hero. Never a figure when nothing changed.
 */

const MINUS = '−';

/** `+2.6%`, `−2%`: a signed percentage with at most one decimal. */
export function formatChangePct(pct: number): string {
  const rounded = Math.round(Math.abs(pct) * 10) / 10;
  const digits = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  const text = `${digits}%`;
  if (rounded === 0) return text;
  return `${pct < 0 ? MINUS : '+'}${text}`;
}

/** What one row shows under its amount: the money, or the percentage when sorted by it. */
export type RowChange =
  | { readonly kind: 'money'; readonly minor: number }
  | { readonly kind: 'pct'; readonly pct: number };

/**
 * The row's change figure, or null when nothing changed. A percentage the baseline cannot give
 * (its total is 0) falls back to the money, so the row still says something moved.
 */
export function rowChangeShown(change: Change, byPct: boolean): RowChange | null {
  if (change.amount === null || change.amount === 0) return null;
  if (byPct && change.pct !== null) return { kind: 'pct', pct: change.pct };
  return { kind: 'money', minor: change.amount };
}
