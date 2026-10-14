import type {
  HoldingFilter,
  Period,
  PeriodView,
  SavedExclusions,
  SavedFilter,
} from '@netnet/contracts';
import {
  allocation,
  filterHoldings,
  periods,
  series,
  summarisePeriods,
  type PeriodSummary,
  type StackedValue,
} from '@netnet/core';
import type { HomeData } from '../home/home-data';
import { asHoldingExclusions, countedFilter, INSIGHT_INTERVAL, PAGE_SIZE } from './filtering';

/**
 * Insights' figures (PRD J11): every one comes from core, computed from the one snapshot over
 * the counted set — the filter's show-only keys plus the Don't Show list. Periods read
 * newest-first; charts read oldest-first.
 */

/** The newest-first periods over the counted set, in full. */
export function insightPeriods(
  data: HomeData,
  view: PeriodView,
  today: string,
  filter: SavedFilter,
  exclusions: SavedExclusions,
): Period[] {
  return periods(
    data.values,
    data.holdings,
    view,
    today,
    asHoldingFilter(filter),
    asHoldingExclusions(exclusions),
  )
    .slice()
    .reverse();
}

/** How many periods the year so far holds in each view (the prototype's YTD take). */
export function ytdTake(view: PeriodView, today: string): number {
  const month = Number(today.slice(5, 7));
  if (view === 'monthly') return month;
  if (view === 'quarterly') return Math.ceil(month / 3);
  return 1;
}

/**
 * The ranged set, newest-first: 0 is All, -1 the year so far, otherwise the newest `range`
 * periods.
 */
export function rangedPeriods(
  all: readonly Period[],
  range: number,
  view: PeriodView,
  today: string,
): Period[] {
  if (range === 0) return [...all];
  const take = range === -1 ? ytdTake(view, today) : range;
  return all.slice(0, Math.max(1, take));
}

/**
 * The assets-only and liabilities-only end values behind the ranged set (oldest-first in), one
 * per period in order. A split's periods start at its own earliest value, so leading periods it
 * never held read 0 — the split held nothing yet — keeping every series on the ranged dates.
 */
export function insightSplits(
  rangedOldestFirst: readonly Period[],
  data: HomeData,
  view: PeriodView,
  today: string,
  filter: SavedFilter,
  exclusions: SavedExclusions,
): { readonly assets: readonly number[]; readonly liabilities: readonly number[] } {
  const base = asHoldingFilter(filter);
  const ends = (show: 'assets' | 'liabilities'): readonly number[] => {
    const byStart = new Map(
      periods(
        data.values,
        data.holdings,
        view,
        today,
        { ...base, show },
        asHoldingExclusions(exclusions),
      ).map((period) => [period.start, period.endValue] as const),
    );
    return rangedOldestFirst.map((period) => byStart.get(period.start) ?? 0);
  };
  return { assets: ends('assets'), liabilities: ends('liabilities') };
}

export interface PeriodWindow {
  /** The clamped page: never past what the ranged set holds. */
  readonly page: number;
  readonly maxPage: number;
  /** The pager's window, oldest-first. */
  readonly windowed: Period[];
}

/** The pager's window over the ranged set (oldest-first in): five periods, newest first out. */
export function periodWindow(rangedOldestFirst: readonly Period[], page: number): PeriodWindow {
  const maxPage = Math.max(0, Math.ceil(rangedOldestFirst.length / PAGE_SIZE) - 1);
  const clamped = Math.min(Math.max(0, page), maxPage);
  const end = rangedOldestFirst.length - clamped * PAGE_SIZE;
  return {
    page: clamped,
    maxPage,
    windowed: rangedOldestFirst.slice(Math.max(0, end - PAGE_SIZE), end),
  };
}

/** The distribution's legend key for the type in slot `slot`; 'other' folds the rest. */
export function slotKey(slot: number): string {
  return `slot:${slot}`;
}

export const OTHER_KEY = 'other';

/**
 * Distribution over time (the prototype's stacked bars): each windowed period's end split by
 * type, signed — liabilities stack below zero. One `series` point per period end over the same
 * counted set the periods use, so every column totals to its period's end value; past the eighth
 * type, core folds the remainder into "Other" (design-system §5).
 */
export function distributionColumns(
  data: HomeData,
  ends: readonly string[],
  view: PeriodView,
  filter: SavedFilter,
  exclusions: SavedExclusions,
  slots: ReadonlyMap<string, number>,
): StackedValue[][] {
  const counted = countedFilter(filter, exclusions);
  return ends.map((end) => {
    const point = series(
      data.values,
      data.holdings,
      { from: end, to: end },
      INSIGHT_INTERVAL[view],
      counted,
      'type',
    ).at(-1);
    const groups = Object.entries(point?.groups ?? {});
    const ups = groups
      .filter(([, value]) => value >= 0)
      .map(([typeId, minor]) => ({
        name: slotKey(slots.get(typeId) ?? 0),
        minor,
        slot: slots.get(typeId) ?? 0,
      }));
    const downs = groups
      .filter(([, value]) => value < 0)
      .map(([typeId, minor]) => ({
        name: slotKey(slots.get(typeId) ?? 0),
        minor: -minor,
        slot: slots.get(typeId) ?? 0,
      }));
    return [
      ...allocation(ups).map((slice) => ({
        key: slice.other ? OTHER_KEY : slice.name,
        value: slice.minor,
      })),
      ...allocation(downs).map((slice) => ({
        key: slice.other ? OTHER_KEY : slice.name,
        value: -slice.minor,
      })),
    ];
  });
}

/** The summary sentence's figures over the ranged set, oldest-first in. */
export function insightSummary(rangedOldestFirst: readonly Period[]): PeriodSummary | null {
  return summarisePeriods(rangedOldestFirst);
}

/** How many holdings the filter and Don't Show list leave counted, like the engine. */
export function countedHoldings(
  data: HomeData,
  filter: SavedFilter,
  exclusions: SavedExclusions,
): number {
  return filterHoldings(data.holdings, countedFilter(filter, exclusions)).length;
}

function asHoldingFilter(filter: SavedFilter): HoldingFilter {
  const out: HoldingFilter = {};
  if (filter.typeIds !== undefined) out.typeIds = filter.typeIds;
  if (filter.tagIds !== undefined) out.tagIds = filter.tagIds;
  if (filter.tagMode !== undefined) out.tagMode = filter.tagMode;
  return out;
}

/* ------------------------------------------------------------------ labels */

/** `June 2026`, `Q1 2026`, `2026`: the period ending `end`, by its end date like the engine. */
export function periodLabel(view: PeriodView, end: string, locale?: string): string {
  const date = new Date(`${end}T00:00:00Z`);
  if (view === 'monthly') {
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  if (view === 'quarterly') {
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  }
  return String(date.getUTCFullYear());
}

/**
 * `Jun`, `Q1`, `2026`: the short label under a chart whose pager already states the years
 * (design-system §5).
 */
export function periodShort(view: PeriodView, end: string, locale?: string): string {
  const date = new Date(`${end}T00:00:00Z`);
  if (view === 'monthly') {
    return date.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  }
  if (view === 'quarterly') {
    return `Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }
  return String(date.getUTCFullYear());
}

/** What the pager names: `Jan – Jun 2026`, `Q1 2026 – Q2 2026`, `2024 – 2026`. */
export function windowLabel(
  windowed: readonly Period[],
  view: PeriodView,
  locale?: string,
): string {
  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  if (!first || !last) return '';
  if (view === 'quarterly') {
    const label = (end: string) => periodLabel(view, end, locale);
    return windowed.length === 1 ? label(first.end) : `${label(first.end)} – ${label(last.end)}`;
  }
  if (view === 'yearly') {
    return windowed.length === 1
      ? first.end.slice(0, 4)
      : `${first.end.slice(0, 4)} – ${last.end.slice(0, 4)}`;
  }
  const month = (end: string) =>
    new Date(`${end}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  const year = (end: string) => end.slice(0, 4);
  if (windowed.length === 1) return `${month(first.end)} ${year(first.end)}`;
  return year(first.end) === year(last.end)
    ? `${month(first.end)} – ${month(last.end)} ${year(last.end)}`
    : `${month(first.end)} ${year(first.end)} – ${month(last.end)} ${year(last.end)}`;
}
