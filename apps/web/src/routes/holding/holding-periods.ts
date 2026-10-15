import type { Holding, Period, PeriodView, Snapshot, Universal } from '@netnet/contracts';
import { periods } from '@netnet/core';
import { holdingInput, valueInputs } from './holding-data';

/**
 * The holding page's period figures from the snapshot (PRD J4, J11): its calendar periods with
 * carried marking, the newest-first pages the pager walks, and the words around them. No screen
 * computes a figure itself (CONVENTIONS §5): the periods come from `core.periods` over this
 * holding alone.
 */

/** Bars per page (the prototype's window): five labelled bars fit a phone. */
export const PERIOD_PAGE_SIZE = 5;

/**
 * This holding's calendar periods, oldest first, from its snapshot values. An archived holding
 * keeps its own chart — leaving the totals is `filterHoldings`' rule, and it does not apply to
 * the holding's own page — so the figure is computed with the archive flag off, like the trend.
 */
export function holdingPeriods(
  snapshot: Snapshot,
  holding: Holding,
  universal: Universal,
  view: PeriodView,
  today: string,
): Period[] {
  const input = { ...holdingInput(holding, universal), archived: false };
  const values = valueInputs(holding.id, snapshot.values[holding.id] ?? []);
  return periods(values, [input], view, today);
}

/** How many periods observe a value dated inside them; the rest are carried. */
export function observedCount(periods: readonly Period[]): number {
  return periods.filter((period) => !period.carried).length;
}

/** Pages over the periods, newest first; page 0 is the newest window. Always at least one. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** The page's window, oldest first for the bars' left-to-right reading. */
export function pageOf(periods: readonly Period[], page: number, size: number): Period[] {
  const newest = [...periods].reverse();
  const safe = Math.min(Math.max(0, page), pageCount(periods.length, size) - 1);
  return newest.slice(safe * size, safe * size + size).reverse();
}

/** `September 2026`, `Q3 2026`, `2026`: the period's full name, from its end. */
export function periodLabel(view: PeriodView, period: Pick<Period, 'end'>): string {
  if (view === 'monthly') {
    return new Date(`${period.end}T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  if (view === 'quarterly') {
    return `Q${Math.floor((Number(period.end.slice(5, 7)) - 1) / 3) + 1} ${period.end.slice(0, 4)}`;
  }
  return period.end.slice(0, 4);
}

/** `Sep`, `Q3`, `2026`: the short label under a bar, where the pager already states the years. */
export function periodShort(view: PeriodView, period: Pick<Period, 'end'>): string {
  if (view === 'monthly') {
    return new Date(`${period.end}T00:00:00Z`).toLocaleDateString(undefined, {
      month: 'short',
      timeZone: 'UTC',
    });
  }
  if (view === 'quarterly') {
    return `Q${Math.floor((Number(period.end.slice(5, 7)) - 1) / 3) + 1}`;
  }
  return period.end.slice(0, 4);
}

/**
 * The pager's window, oldest first in: `Jun – Sep 2026`, `Sep 2025 – Feb 2026`, `Q3 2025 – Q3
 * 2026`, `2022 – 2026` (the prototype's labels). One period names itself with its year.
 */
export function windowLabel(view: PeriodView, window: readonly Period[]): string {
  const first = window[0];
  const last = window[window.length - 1];
  if (first === undefined || last === undefined) return '';
  if (view !== 'monthly') {
    const older = periodLabel(view, first);
    return window.length === 1 ? older : `${older} – ${periodLabel(view, last)}`;
  }
  const month = (period: Period): string => periodShort(view, period);
  const older = `${month(first)} ${first.end.slice(0, 4)}`;
  if (window.length === 1) return older;
  return first.end.slice(0, 4) === last.end.slice(0, 4)
    ? `${month(first)} – ${month(last)} ${last.end.slice(0, 4)}`
    : `${older} – ${month(last)} ${last.end.slice(0, 4)}`;
}

/** The M/Q/Y switch's segments (the prototype's words). */
export const VIEW_LABELS: Record<PeriodView, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};
