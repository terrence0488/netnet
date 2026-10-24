import type { Period } from '@netnet/contracts';
import type { PeriodSummary } from '@netnet/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { insightSummary } from './insights-data';
import { Summary } from './Summary';

/** Fictional months, oldest first, from an opening total, each moving it by its change. */
function months(opening: number, changes: readonly number[]): Period[] {
  let previous = opening;
  return changes.map((change, index) => {
    const month = String(index + 1).padStart(2, '0');
    const period: Period = {
      start: `2026-${month}-01`,
      end: `2026-${month}-28`,
      endValue: previous + change,
      change,
      changePct: previous === 0 ? null : (change / Math.abs(previous)) * 100,
      carried: false,
      drivers: [],
    };
    previous += change;
    return period;
  });
}

/** The summary line's visible text, its elements' words spaced as the browser reads them. */
function line(
  summary: PeriodSummary | null,
  over: { filteredOut?: boolean; tracked?: number; noHistory?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Summary
        filteredOut={over.filteredOut ?? false}
        tracked={over.tracked ?? 3}
        noHistory={over.noHistory ?? summary === null}
        noun="month"
        plural="months"
        summary={summary}
        currency="SGD"
      />
    </MemoryRouter>,
  )
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Summary', () => {
  it('reads the test report’s months as their mean change and its share of the opening', () => {
    // $9,000 falls to $8,300: −$4,000, +$1,300, +$1,000, $0, +$1,000. The months' own percents
    // (−44.4%, +26%, +15.9%, 0%, +13.7%) averaged to +2.2%, rising while net worth fell.
    const summary = insightSummary(months(9_000_00, [-4_000_00, 1_300_00, 1_000_00, 0, 1_000_00]));
    expect(line(summary)).toBe('Averaging −$140 (−1.6%) a month over the last 5 months.');
  });

  it('states the amount alone when the opening total is 0, so there is no percent', () => {
    expect(line({ count: 2, avgAbs: 500_00, avgPct: null })).toBe(
      'Averaging +$500 a month over the last 2 months.',
    );
    expect(line(insightSummary(months(0, [500_00, 500_00])))).toBe(
      'Averaging +$500 a month over the last 2 months.',
    );
  });

  it('states the average change, signed, a period over the periods it covers', () => {
    expect(line({ count: 3, avgAbs: 1_200_00, avgPct: 8 })).toBe(
      'Averaging +$1K (+8%) a month over the last 3 months.',
    );
    expect(line({ count: 1, avgAbs: -40_00, avgPct: -2.5 })).toBe(
      'Averaging −$40 (−2.5%) a month over the last 1 month.',
    );
  });

  it('says what is missing when there is nothing to average', () => {
    expect(line(null, { filteredOut: true })).toBe('Nothing matches these filters.');
    expect(line(null, { tracked: 0 })).toBe(
      'Nothing tracked yet. Add what you have on Home to start.',
    );
    expect(line(null)).toBe(
      'A month-on-month comparison needs two months of values. It starts next month, or now if you add an earlier value.',
    );
  });
});
