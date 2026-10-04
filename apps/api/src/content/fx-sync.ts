import type { Executor } from '../db/client';
import { insertRates, latestRateDate } from '../db/fx-rates';
import {
  fetchRates,
  FX_SOURCE_NAMES,
  FxFetchError,
  type DateRange,
  type FxRow,
  type FxSource,
} from './fx-sources';

/**
 * Fills `core.fx_rate` from both sources: the daily cron (`syncRecent`) and the one-off backfill
 * (`syncRange`) share it. Each source is fetched and stored on its own, so one failing leaves the
 * other's rates, and every rate already stored stays in use with its date (architecture §6.6).
 */
export interface RateStore {
  latestDate(source: FxSource): Promise<string | null>;
  /** Stores rates not already stored; returns how many were new. */
  insert(rows: readonly FxRow[]): Promise<number>;
}

export interface SyncDeps {
  store: RateStore;
  fetch: typeof fetch;
  /** Per request. */
  timeoutMs: number;
  /** Tries per request; later tries wait 2 s, then 4 s, and so on. */
  attempts: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called after each stored window, for a script's progress lines. */
  onWindow?: (source: FxSource, window: DateRange, inserted: number) => void;
}

export type SourceResult =
  | { ok: true; from: string; to: string; fetched: number; inserted: number }
  | { ok: false; from: string; to: string; failedFrom: string; status?: number; message: string };

export type SyncResult = Record<FxSource, SourceResult>;

/** How far back the daily run fetches again, for rates a central bank publishes late. */
export const RECENT_DAYS = 7;

/** `core.fx_rate` as a `RateStore`. */
export function databaseRateStore(db: Executor): RateStore {
  return {
    latestDate: (source) => latestRateDate(db, source),
    insert: (rows) => insertRates(db, rows),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(date: string): Date {
  if (!DATE.test(date)) throw new Error(`Not a date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  const day = parseDay(date);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** `range` cut at each 31 December, so no request spans more than a calendar year. */
export function yearWindows({ from, to }: DateRange): DateRange[] {
  parseDay(from);
  parseDay(to);
  const windows: DateRange[] = [];
  for (let start = from; start <= to;) {
    const yearEnd = `${start.slice(0, 4)}-12-31`;
    const end = yearEnd < to ? yearEnd : to;
    windows.push({ from: start, to: end });
    start = addDays(end, 1);
  }
  return windows;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
  source: FxSource,
  window: DateRange,
  deps: SyncDeps,
): Promise<FxRow[]> {
  const sleep = deps.sleep ?? wait;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchRates(source, window, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });
    } catch (error) {
      if (attempt >= deps.attempts) throw error;
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

/** Fetches and stores one source's rates over `range`, a year at a time, oldest first. */
export async function syncSource(
  source: FxSource,
  range: DateRange,
  deps: SyncDeps,
): Promise<SourceResult> {
  let fetched = 0;
  let inserted = 0;
  for (const window of yearWindows(range)) {
    let rows: FxRow[];
    try {
      rows = await fetchWithRetry(source, window, deps);
    } catch (error) {
      if (!(error instanceof FxFetchError)) throw error;
      return {
        ok: false,
        ...range,
        failedFrom: window.from,
        ...(error.status === undefined ? {} : { status: error.status }),
        message: error.message,
      };
    }
    const added = await deps.store.insert(rows);
    fetched += rows.length;
    inserted += added;
    deps.onWindow?.(source, window, added);
  }
  return { ok: true, ...range, fetched, inserted };
}

/** Both sources over the same range: the backfill. */
export async function syncRange(range: DateRange, deps: SyncDeps): Promise<SyncResult> {
  const ecb = await syncSource('ecb', range, deps);
  const fallback = await syncSource('fallback', range, deps);
  return { ecb, fallback };
}

/**
 * The daily run: for each source, from the last week (or from its newest stored rate, if that is
 * older, to fill the gap) through `today`. A source with no rates yet gets the last week only;
 * history is the backfill's job.
 */
export async function syncRecent(today: string, deps: SyncDeps): Promise<SyncResult> {
  const recent = addDays(today, -RECENT_DAYS);
  const results = await Promise.all(
    FX_SOURCE_NAMES.map(async (source) => {
      const latest = await deps.store.latestDate(source);
      const from = latest !== null && latest < recent ? latest : recent;
      return [source, await syncSource(source, { from, to: today }, deps)] as const;
    }),
  );
  return Object.fromEntries(results) as SyncResult;
}
