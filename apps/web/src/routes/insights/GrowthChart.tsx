import { bars } from '@netnet/core';
import { useMemo } from 'react';
import { cx } from '../../components/cx';
import { formatSignedCompactMoney } from '../../charts/format';
import styles from './GrowthChart.module.css';

export interface GrowthChartProps {
  /**
   * The signed change per period in minor units, oldest-first; null for the first period, which
   * has nothing earlier to compare with.
   */
  readonly values: readonly (number | null)[];
  /** The short label per period (`Jun`, `Q1`): the pager above names the years. */
  readonly shorts: readonly string[];
  /** The ISO code the changes are denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the labels. */
  readonly height: number;
  readonly testId?: string;
}

/**
 * Period growth (design-system §5, the prototype's bars): each bar carries its change above it
 * in HTML, so the plot holds geometry only and no axis. Gain and loss always carry their sign,
 * never hue alone; a flat period reads `—`, never `$0` noise, and so does the first, a tick
 * rather than a bar, since nothing earlier compares with it. The labels hide from screen
 * readers: the period list below holds every figure on this chart.
 */
export function GrowthChart({
  values,
  shorts,
  currency,
  height,
  testId = 'growth-chart',
}: GrowthChartProps) {
  const layout = useMemo(() => bars(values), [values]);
  return (
    <div className={styles.chart} data-testid={testId}>
      <div className={styles.labels} aria-hidden="true">
        {values.map((value, index) => (
          <div
            key={shorts[index] ?? index}
            className={cx(
              styles.value,
              value === null || value === 0 ? styles.flat : value > 0 ? styles.gain : styles.loss,
            )}
          >
            {value === null || value === 0 ? '—' : formatSignedCompactMoney(value, currency)}
          </div>
        ))}
      </div>
      <div className={styles.plot} style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <line
            className={styles.zero}
            x1="0"
            y1={layout.zero}
            x2="100"
            y2={layout.zero}
            vectorEffect="non-scaling-stroke"
          />
          {layout.cells.map((cell, index) => (
            <rect
              key={shorts[index] ?? index}
              x={cell.x}
              y={cell.y}
              width={cell.width}
              height={cell.height}
              className={cx(
                styles.bar,
                cell.sign > 0 ? styles.up : cell.sign < 0 ? styles.down : styles.tick,
              )}
            />
          ))}
        </svg>
      </div>
      <div className={styles.shorts} aria-hidden="true">
        {shorts.map((short, index) => (
          <div key={`${short}-${index}`}>{short}</div>
        ))}
      </div>
    </div>
  );
}
