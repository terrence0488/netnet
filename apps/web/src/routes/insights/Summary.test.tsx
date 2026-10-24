import type { PeriodSummary } from '@netnet/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Summary } from './Summary';

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
