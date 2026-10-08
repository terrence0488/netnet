import { ChartPlaceholder } from './ChartPlaceholder';
import { LineChart } from './LineChart';
import styles from './AssetsLiabilitiesChart.module.css';

export interface AssetsLiabilitiesChartProps {
  /** One `YYYY-MM-DD` per point, oldest first. */
  readonly dates: readonly string[];
  /** Assets per date in minor units: magnitudes, one value per date. */
  readonly assets: readonly number[];
  /** Liabilities per date in minor units: magnitudes (never negative), one value per date. */
  readonly liabilities: readonly number[];
  /** Net worth per date in minor units: signed, one value per date. */
  readonly netWorth: readonly number[];
  /** The ISO code every value is denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the date axis or legend. */
  readonly height: number;
  /** Gridlines and y-axis labels (the "Show zero bounds" view setting). On by default. */
  readonly showGrid?: boolean;
  readonly testId?: string;
  /** The placeholder's sticker when the range holds too little ("Pick a longer range"). */
  readonly emptyLabel?: string;
  /** The single line saying what makes the chart appear, where the screen says it nowhere else. */
  readonly reason?: string;
}

/** The legend's rows, in the prototype's order: assets, net worth, liabilities. */
const LEGEND = [
  { name: 'Assets', color: 'var(--gain)' },
  { name: 'Net worth', color: 'var(--ink-3)' },
  { name: 'Liabilities', color: 'var(--loss)' },
];

/**
 * Assets vs liabilities (prototype Insights): three lines read point by point against a domain
 * that includes zero — assets and liabilities washed, net worth plain. With under two points it
 * keeps its place as the frosted placeholder, with no legend: controls that act on data are not
 * shown on it.
 */
export function AssetsLiabilitiesChart({
  dates,
  assets,
  liabilities,
  netWorth,
  currency,
  height,
  showGrid = true,
  testId = 'assets-liabilities-chart',
  emptyLabel = 'Need more data',
  reason,
}: AssetsLiabilitiesChartProps) {
  if (dates.length < 2) {
    return (
      <ChartPlaceholder
        kind="lines"
        height={height}
        label={emptyLabel}
        {...(reason === undefined ? {} : { sub: reason })}
        testId={`${testId}-placeholder`}
      />
    );
  }
  return (
    <>
      <LineChart
        dates={dates}
        series={[
          { name: 'Assets', values: assets, color: 'var(--gain)', fill: true },
          { name: 'Liabilities', values: liabilities, color: 'var(--loss)', fill: true },
          { name: 'Net worth', values: netWorth, color: 'var(--ink-3)', fill: false },
        ]}
        currency={currency}
        height={height}
        label="Assets vs liabilities"
        showGrid={showGrid}
        includeZero
        testId={testId}
      />
      <div className={styles.legend} data-testid={`${testId}-legend`}>
        {LEGEND.map((row) => (
          <span key={row.name} className={styles.item}>
            <i className={styles.swatch} style={{ background: row.color }} aria-hidden="true" />
            {row.name}
          </span>
        ))}
      </div>
    </>
  );
}
