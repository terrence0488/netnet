import type { Point } from '@netnet/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AllocationChart } from './AllocationChart';
import { AssetsLiabilitiesChart } from './AssetsLiabilitiesChart';
import { ChartPlaceholder } from './ChartPlaceholder';
import { LineChart } from './LineChart';
import { TrendChart } from './TrendChart';

const html = renderToStaticMarkup;

/** A fictional year of month-end net worth, oldest first. */
const POINTS: Point[] = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-${String(i + 1).padStart(2, '0')}-28`,
  total: 1_700_000_00 + i * 12_000_00,
  carried: false,
}));

describe('TrendChart', () => {
  const render = () => html(<TrendChart points={POINTS} currency="USD" height={150} />);

  it('is a named group the Playwright specs drive by hook', () => {
    const markup = render();
    expect(markup).toContain('data-testid="trend-chart"');
    expect(markup).toContain('data-testid="trend-chart-plot"');
    expect(markup).toMatch(/<div[^>]*tabindex="0"[^>]*role="group"/);
    expect(markup).toContain('aria-label="Trend. 12 points from');
    expect(markup).toContain('role="status"');
  });

  it('draws one brand line over its wash, with gridlines and compact ticks', () => {
    const markup = render();
    expect(markup).toContain('stroke:var(--brand)');
    expect(markup).toContain('fill:var(--brand)');
    expect(markup).toContain('fill-opacity:var(--wash)');
    expect(markup).toMatch(/\$1\.8M/);
  });

  it('labels three dates on first paint, first and last always', () => {
    const markup = render();
    expect(markup).toContain('Jan 2026');
    expect(markup).toContain('Dec 2026');
  });

  it('hides gridlines and ticks when zero bounds are off', () => {
    const markup = html(
      <TrendChart points={POINTS} currency="USD" height={150} showGrid={false} />,
    );
    expect(markup).not.toContain('$1.8M');
  });

  it('keeps its place as the placeholder until two points can be read', () => {
    const one = html(<TrendChart points={POINTS.slice(0, 1)} currency="USD" height={150} />);
    expect(one).toContain('data-testid="trend-chart-placeholder"');
    expect(one).toContain('Need more data');
    expect(one).not.toContain('trend-chart-plot');
    const custom = html(
      <TrendChart
        points={[]}
        currency="USD"
        height={150}
        emptyLabel="Pick a longer range"
        reason="Update a holding next month, or add an earlier value, to see your trend."
      />,
    );
    expect(custom).toContain('Pick a longer range');
    expect(custom).toContain(
      'Update a holding next month, or add an earlier value, to see your trend.',
    );
  });
});

describe('AssetsLiabilitiesChart', () => {
  const dates = POINTS.map((p) => p.date);
  const assets = POINTS.map((p) => p.total + 400_000_00);
  const liabilities = POINTS.map(() => 400_000_00);
  const netWorth = POINTS.map((p) => p.total);

  it('draws three lines against zero with the legend in order', () => {
    const markup = html(
      <AssetsLiabilitiesChart
        dates={dates}
        assets={assets}
        liabilities={liabilities}
        netWorth={netWorth}
        currency="USD"
        height={180}
      />,
    );
    expect(markup).toContain('data-testid="assets-liabilities-chart-plot"');
    expect(markup).toContain('stroke:var(--gain)');
    expect(markup).toContain('stroke:var(--loss)');
    expect(markup).toContain('stroke:var(--ink-3)');
    expect(markup).toContain('data-testid="assets-liabilities-chart-legend"');
    const legend = markup.indexOf('assets-liabilities-chart-legend');
    const ordered = ['Assets', 'Net worth', 'Liabilities'].map((name) =>
      markup.indexOf(`>${name}<`, legend),
    );
    expect(ordered[0]).toBeGreaterThan(0);
    expect(ordered[1]).toBeGreaterThan(ordered[0] ?? 0);
    expect(ordered[2]).toBeGreaterThan(ordered[1] ?? 0);
  });

  it('keeps its place as the three-line placeholder, with no legend on it', () => {
    const markup = html(
      <AssetsLiabilitiesChart
        dates={dates.slice(0, 1)}
        assets={assets.slice(0, 1)}
        liabilities={liabilities.slice(0, 1)}
        netWorth={netWorth.slice(0, 1)}
        currency="USD"
        height={180}
      />,
    );
    expect(markup).toContain('data-testid="assets-liabilities-chart-placeholder"');
    expect(markup).toContain('Need more data');
    expect(markup).not.toContain('assets-liabilities-chart-legend');
  });
});

describe('LineChart', () => {
  it('draws the solid zero line only when zero crosses the plot', () => {
    const crossed = html(
      <LineChart
        dates={['2026-01-01', '2026-02-01']}
        series={[{ name: 'Net', values: [-100, 100], color: 'var(--brand)', fill: false }]}
        currency="USD"
        height={150}
        label="Trend"
        testId="trend-chart"
      />,
    );
    expect(crossed).toMatch(/class="[^"]*zero[^"]*"/);
    const above = html(
      <LineChart
        dates={['2026-01-01', '2026-02-01']}
        series={[{ name: 'Net', values: [100, 200], color: 'var(--brand)', fill: false }]}
        currency="USD"
        height={150}
        label="Trend"
        testId="trend-chart"
      />,
    );
    expect(above).not.toMatch(/class="[^"]*zero[^"]*"/);
  });

  it('never reads the same figure twice when the span compacts tightly', () => {
    const markup = html(
      <LineChart
        dates={['2026-01-01', '2026-02-01']}
        series={[
          { name: 'Net', values: [100_000_000, 100_100_000], color: 'var(--brand)', fill: false },
        ]}
        currency="USD"
        height={150}
        label="Trend"
        testId="trend-chart"
      />,
    );
    expect(markup.match(/\$1M/g) ?? []).toHaveLength(1);
  });

  it('names a repeated month once on the date axis, keeping the ticks’ slots', () => {
    const dates = Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 8).padStart(2, '0')}`);
    const markup = html(
      <LineChart
        dates={dates}
        series={[
          {
            name: 'Net',
            values: dates.map((_, i) => 100_000_000 + i * 1_000_000),
            color: 'var(--brand)',
            fill: true,
          },
        ]}
        currency="USD"
        height={150}
        label="Trend"
        testId="trend-chart"
      />,
    );
    // Three September ticks: the month is named once, the other slots blank.
    expect(markup.match(/Sep 2026/g) ?? []).toHaveLength(1);
    expect(markup.match(/<span><\/span>/g) ?? []).toHaveLength(2);
  });

  it('renders its fallback without points', () => {
    const markup = html(
      <LineChart
        dates={[]}
        series={[]}
        currency="USD"
        height={150}
        label="Trend"
        testId="trend-chart"
        fallback={<p>Nothing yet</p>}
      />,
    );
    expect(markup).toBe('<p>Nothing yet</p>');
  });
});

describe('AllocationChart', () => {
  it('ranks entities largest first with a direct figure on every row', () => {
    const markup = html(
      <AllocationChart
        segments={[
          { name: 'Cash', minor: 100_00, slot: 0 },
          { name: 'Listed', minor: 900_00, slot: 1 },
        ]}
        currency="USD"
        mode="percent"
      />,
    );
    expect(markup).toContain('data-testid="allocation-chart"');
    expect(markup.indexOf('Listed')).toBeLessThan(markup.indexOf('Cash'));
    expect(markup).toContain('90.0%');
    expect(markup).toContain('10.0%');
    const money = html(
      <AllocationChart
        segments={[{ name: 'Cash', minor: 59_000_00, slot: 0 }]}
        currency="USD"
        mode="money"
      />,
    );
    expect(money).toContain('$59K');
  });

  it('colours by fixed slot and folds past the eighth into Other', () => {
    const segments = Array.from({ length: 10 }, (_, i) => ({
      name: `Type ${i}`,
      minor: 100_00 * (10 - i),
      slot: i,
    }));
    const markup = html(<AllocationChart segments={segments} currency="USD" mode="percent" />);
    expect(markup).toContain('color:var(--chart-1)');
    expect(markup).toContain('color:var(--chart-8)');
    expect(markup).not.toContain('var(--chart-9)');
    expect(markup).toContain('>Other<');
    expect(markup).toContain('color:var(--ink-3)');
  });
});

describe('ChartPlaceholder', () => {
  it('labels every shape without figures, dates or data colours', () => {
    for (const kind of ['line', 'lines', 'bars', 'stacked'] as const) {
      const markup = html(<ChartPlaceholder kind={kind} height={170} />);
      expect(markup).toContain('data-testid="chart-placeholder"');
      expect(markup).toContain('Need more data');
      expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(markup).not.toMatch(/var\(--brand\)|var\(--gain\)|var\(--loss\)|var\(--chart-/);
      // Nothing readable as a result: the words carry no digits at all.
      const words = markup.replace(/<[^>]*>/g, '');
      expect(words).not.toMatch(/\d/);
    }
  });

  it('says once what makes the chart appear', () => {
    const markup = html(
      <ChartPlaceholder
        kind="line"
        height={170}
        label="Pick a longer range"
        sub="Update a holding next month, or add an earlier value, to see your trend."
      />,
    );
    expect(markup).toContain('Pick a longer range');
    expect(markup).toContain(
      'Update a holding next month, or add an earlier value, to see your trend.',
    );
  });
});
