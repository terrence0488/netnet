import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { FxRow, FxSource } from './fx-sources';
import {
  addDays,
  RECENT_DAYS,
  syncRange,
  syncRecent,
  yearWindows,
  type RateStore,
  type SyncDeps,
} from './fx-sync';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ECB = fixture('frankfurter-ecb.json');
const BLEND = fixture('frankfurter-blend.json');

/** An in-memory `core.fx_rate`: one rate per date and currency, first write kept. */
function memoryStore(rows: FxRow[] = []): RateStore & { rows: Map<string, FxRow> } {
  const stored = new Map(rows.map((r) => [`${r.date} ${r.currency}`, r]));
  return {
    rows: stored,
    latestDate: (source: FxSource) => {
      const dates = [...stored.values()].filter((r) => r.source === source).map((r) => r.date);
      return Promise.resolve(dates.length > 0 ? dates.sort().at(-1)! : null);
    },
    insert: (batch) => {
      let added = 0;
      for (const row of batch) {
        const id = `${row.date} ${row.currency}`;
        if (!stored.has(id)) {
          stored.set(id, row);
          added += 1;
        }
      }
      return Promise.resolve(added);
    },
  };
}

/** Answers each source with its fixture, or with `failing`'s status. */
function frankfurter(failing: Partial<Record<FxSource, number>> = {}) {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const source: FxSource = url.searchParams.get('providers') === 'ECB' ? 'ecb' : 'fallback';
    const status = failing[source];
    if (status !== undefined)
      return Promise.resolve(Response.json({ message: 'down' }, { status }));
    return Promise.resolve(Response.json(source === 'ecb' ? ECB : BLEND));
  });
}

function deps(store: RateStore, fetchImpl: typeof fetch, attempts = 1): SyncDeps {
  return { store, fetch: fetchImpl, timeoutMs: 1000, attempts, sleep: () => Promise.resolve() };
}

const requested = (fake: ReturnType<typeof frankfurter>) =>
  fake.mock.calls.map(([input]) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return `${url.searchParams.get('providers') ?? 'blend'} ${url.searchParams.get('from')}..${url.searchParams.get('to')}`;
  });

describe('yearWindows', () => {
  it('cuts a range at each year end', () => {
    expect(yearWindows({ from: '2024-11-30', to: '2026-02-01' })).toStrictEqual([
      { from: '2024-11-30', to: '2024-12-31' },
      { from: '2025-01-01', to: '2025-12-31' },
      { from: '2026-01-01', to: '2026-02-01' },
    ]);
    expect(yearWindows({ from: '2026-08-01', to: '2026-08-01' })).toHaveLength(1);
    expect(yearWindows({ from: '2026-08-02', to: '2026-08-01' })).toStrictEqual([]);
  });

  it('counts days across month and leap-year ends', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-08-03', -RECENT_DAYS)).toBe('2026-07-27');
  });
});

describe('syncRange (the backfill)', () => {
  it('stores both sources a year at a time, and stores nothing twice', async () => {
    const store = memoryStore();
    const fake = frankfurter();
    const first = await syncRange({ from: '2025-12-01', to: '2026-08-04' }, deps(store, fake));
    expect(requested(fake)).toStrictEqual([
      'ECB 2025-12-01..2025-12-31',
      'ECB 2026-01-01..2026-08-04',
      'blend 2025-12-01..2025-12-31',
      'blend 2026-01-01..2026-08-04',
    ]);
    expect(first.ecb).toMatchObject({ ok: true, inserted: 13 });
    expect(first.fallback).toMatchObject({ ok: true, inserted: 10 });
    expect(store.rows.size).toBe(23);

    const again = await syncRange({ from: '2026-07-01', to: '2026-08-04' }, deps(store, fake));
    expect(again.ecb).toMatchObject({ ok: true, inserted: 0 });
    expect(again.fallback).toMatchObject({ ok: true, inserted: 0 });
  });

  it('retries a failed request, waiting longer each time, then reports where it stopped', async () => {
    const store = memoryStore();
    const fake = frankfurter({ fallback: 503 });
    const sleep = vi.fn(() => Promise.resolve());
    const result = await syncRange(
      { from: '2026-07-01', to: '2026-08-04' },
      { ...deps(store, fake, 3), sleep },
    );
    expect(result.ecb).toMatchObject({ ok: true, inserted: 13 });
    expect(result.fallback).toMatchObject({
      ok: false,
      failedFrom: '2026-07-01',
      status: 503,
      message: 'The source answered 503.',
    });
    expect(sleep.mock.calls).toStrictEqual([[2000], [4000]]);
    expect([...store.rows.values()].every((r) => r.source === 'ecb')).toBe(true);
  });
});

describe('syncRecent (the daily cron)', () => {
  const today = '2026-08-04';

  it('fetches the last week again, for late publications', async () => {
    const store = memoryStore([
      { date: '2026-08-03', currency: 'SGD', perUsd: '1.3', source: 'ecb' },
      { date: '2026-08-01', currency: 'VND', perUsd: '26150', source: 'fallback' },
    ]);
    const fake = frankfurter();
    await syncRecent(today, deps(store, fake));
    expect(requested(fake).sort()).toStrictEqual([
      'ECB 2026-07-28..2026-08-04',
      'blend 2026-07-28..2026-08-04',
    ]);
  });

  it('fills a gap from the newest stored rate, each source on its own', async () => {
    const store = memoryStore([
      { date: '2026-06-30', currency: 'SGD', perUsd: '1.3', source: 'ecb' },
      { date: '2025-12-30', currency: 'VND', perUsd: '26000', source: 'fallback' },
    ]);
    const fake = frankfurter();
    await syncRecent(today, deps(store, fake));
    expect(requested(fake).sort()).toStrictEqual([
      'ECB 2026-06-30..2026-08-04',
      'blend 2025-12-30..2025-12-31',
      'blend 2026-01-01..2026-08-04',
    ]);
  });

  it('starts an empty table with the last week; history is the backfill’s', async () => {
    const fake = frankfurter();
    const result = await syncRecent(today, deps(memoryStore(), fake));
    expect(result.ecb).toMatchObject({ ok: true, from: '2026-07-28', to: today });
    expect(result.fallback).toMatchObject({ ok: true, from: '2026-07-28', to: today });
  });

  it('keeps one source’s rates when the other fails', async () => {
    const store = memoryStore();
    const result = await syncRecent(today, deps(store, frankfurter({ ecb: 500 })));
    expect(result.ecb).toMatchObject({ ok: false, status: 500 });
    expect(result.fallback).toMatchObject({ ok: true, inserted: 10 });
  });
});
