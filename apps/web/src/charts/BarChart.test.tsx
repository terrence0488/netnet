import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BarChart, type BarDatum } from './BarChart';

const html = renderToStaticMarkup;

/** A fictional quarter of holding changes: up, down, carried flat, and the first with no past. */
const BARS: BarDatum[] = [
  {
    key: '2026-06',
    label: 'June 2026',
    short: 'Jun',
    value: null,
    endValue: 100_000,
    carried: false,
  },
  {
    key: '2026-07',
    label: 'July 2026',
    short: 'Jul',
    value: 5_000,
    endValue: 105_000,
    carried: false,
  },
  {
    key: '2026-08',
    label: 'August 2026',
    short: 'Aug',
    value: -2_000,
    endValue: 103_000,
    carried: false,
  },
  {
    key: '2026-09',
    label: 'September 2026',
    short: 'Sep',
    value: 0,
    endValue: 103_000,
    carried: true,
  },
];

describe('BarChart', () => {
  const render = () =>
    html(
      <BarChart
        bars={BARS}
        currency="SGD"
        height={160}
        label="Period changes"
        testId="period-chart"
      />,
    );

  it('is a named group the Playwright specs drive by hook', () => {
    const markup = render();
    expect(markup).toContain('data-testid="period-chart"');
    expect(markup).toContain('data-testid="period-chart-plot"');
    expect(markup).toMatch(/<div[^>]*tabindex="0"[^>]*role="group"/);
    expect(markup).toContain(
      'aria-label="Period changes. 4 periods from June 2026 to September 2026.',
    );
    expect(markup).toContain('role="status"');
  });

  it('draws gain, loss and rule-strong bars against a solid zero line', () => {
    const markup = render();
    expect(markup).toContain('fill="var(--gain)"');
    expect(markup).toContain('fill="var(--loss)"');
    expect(markup).toContain('fill="var(--rule-strong)"');
    expect(markup.match(/<line/g)).toHaveLength(2);
  });

  it('carries each change above its bar and each short name below, so no axis is read', () => {
    const markup = render();
    expect(markup).toContain('+$50');
    expect(markup).toContain('−$20');
    expect(markup).toContain('Jun');
    expect(markup).toContain('Sep');
  });

  it('marks carried periods as carried, on the bar and under it', () => {
    const markup = render();
    expect(markup).toContain('data-carried="true"');
    expect(markup).toContain('data-carried="false"');
    expect(markup).toMatch(/<span[^>]*>carried<\/span>/);
  });

  it('draws no bar for the period with nothing to compare with', () => {
    const markup = render();
    expect(markup).toContain('—');
  });

  it('keeps its place as the fallback without bars', () => {
    const markup = html(
      <BarChart
        bars={[]}
        currency="SGD"
        height={160}
        label="Period changes"
        testId="period-chart"
        fallback={<p>Need more data</p>}
      />,
    );
    expect(markup).toContain('Need more data');
    expect(markup).not.toContain('period-chart-plot');
  });
});
