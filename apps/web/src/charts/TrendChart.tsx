import type { Point } from '@netnet/contracts';
import { ChartPlaceholder } from './ChartPlaceholder';
import { LineChart } from './LineChart';

export interface TrendChartProps {
  /** One point per date from core.series, oldest first. */
  readonly points: readonly Point[];
  /** The ISO code the totals are denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the date axis. */
  readonly height: number;
  /** The chart's name, read first by a screen reader. */
  readonly label?: string;
  /** Gridlines and y-axis labels (the "Show zero bounds" view setting). On by default. */
  readonly showGrid?: boolean;
  readonly testId?: string;
  /** The placeholder's sticker when the range holds too little ("Pick a longer range"). */
  readonly emptyLabel?: string;
  /** The single line saying what makes the trend appear. */
  readonly reason?: string;
}

/**
 * The trend (design-system §5, §6): a 3px brand line over its wash, read point by point. With
 * under two points it keeps its place as the frosted placeholder, saying what it needs.
 */
export function TrendChart({
  points,
  currency,
  height,
  label = 'Trend',
  showGrid = true,
  testId = 'trend-chart',
  emptyLabel = 'Need more data',
  reason,
}: TrendChartProps) {
  return (
    <LineChart
      dates={points.map((p) => p.date)}
      series={[
        {
          name: label,
          values: points.map((p) => p.total),
          color: 'var(--brand)',
          fill: true,
        },
      ]}
      currency={currency}
      height={height}
      label={label}
      showGrid={showGrid}
      testId={testId}
      fallback={
        <ChartPlaceholder
          kind="line"
          height={height}
          label={emptyLabel}
          {...(reason === undefined ? {} : { sub: reason })}
          testId={`${testId}-placeholder`}
        />
      }
    />
  );
}
