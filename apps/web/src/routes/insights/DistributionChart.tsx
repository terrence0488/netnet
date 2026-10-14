import { stacked, type StackedValue } from '@netnet/core';
import { useMemo } from 'react';
import { formatCompactMoney } from '../../charts/format';
import { OTHER_KEY } from './insights-data';
import styles from './DistributionChart.module.css';

/**
 * Distribution over time (design-system §5, the prototype's stacked bars): each windowed
 * period's end split by type, liabilities below the zero line, the column's total above it.
 * Colour follows the type's fixed slot, so filtering never repaints the survivors; past the
 * eighth, types fold into "Other". Names sit beside every swatch, which is what satisfies the
 * light-mode relief rule. The labels hide from screen readers: the period list below holds
 * every total on this chart.
 */
export function DistributionChart({
  columns,
  shorts,
  currency,
  height,
  labelOf,
  testId = 'distribution-chart',
}: {
  /** One column per windowed period, oldest-first: signed minor units keyed by legend key. */
  readonly columns: readonly (readonly StackedValue[])[];
  /** The short label per period (`Jun`, `Q1`): the pager above names the years. */
  readonly shorts: readonly string[];
  /** The ISO code the totals are denominated in. */
  readonly currency: string;
  /** The plot's height in px, without the labels. */
  readonly height: number;
  /** The legend's name per key (`slot:N`, `other`). */
  readonly labelOf: (key: string) => string;
  readonly testId?: string;
}) {
  const layout = useMemo(() => stacked(columns), [columns]);
  const legend = useMemo(() => {
    const seen: string[] = [];
    for (const column of columns) {
      for (const part of column) {
        if (!seen.includes(part.key)) seen.push(part.key);
      }
    }
    return [
      ...seen.filter((key) => key !== OTHER_KEY),
      ...(seen.includes(OTHER_KEY) ? [OTHER_KEY] : []),
    ];
  }, [columns]);

  return (
    <div className={styles.chart} data-testid={testId}>
      <div className={styles.legend} data-testid={`${testId}-legend`}>
        {legend.map((key) => (
          <span key={key} className={styles.item}>
            <i className={styles.swatch} style={{ background: swatch(key) }} aria-hidden="true" />
            {labelOf(key)}
          </span>
        ))}
      </div>
      <div className={styles.labels} aria-hidden="true">
        {layout.columns.map((column, index) => (
          <div key={shorts[index] ?? index} className={styles.total}>
            {formatCompactMoney(column.total, currency)}
          </div>
        ))}
      </div>
      <div className={styles.plot} style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {layout.columns.map((column, index) => (
            <g key={shorts[index] ?? index}>
              {column.segments.map((segment, part) => (
                <rect
                  key={`${segment.key}-${part}`}
                  x={column.x}
                  y={segment.y}
                  width={column.width}
                  height={segment.height}
                  style={{ fill: swatch(segment.key) }}
                />
              ))}
            </g>
          ))}
          <line
            className={styles.zero}
            x1="0"
            y1={layout.zero}
            x2="100"
            y2={layout.zero}
            vectorEffect="non-scaling-stroke"
          />
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

/** The legend key's colour: the type slot's fixed hue, ink for the folded remainder. */
function swatch(key: string): string {
  if (key === OTHER_KEY) return 'var(--ink-3)';
  const slot = Number(key.slice('slot:'.length));
  return Number.isInteger(slot) && slot >= 0 && slot < 8
    ? `var(--chart-${slot + 1})`
    : 'var(--ink-3)';
}
