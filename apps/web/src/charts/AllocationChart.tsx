import { allocation } from '@netnet/core';
import { formatCompactMoney } from './format';
import styles from './AllocationChart.module.css';

export interface AllocationSegment {
  /** The entity's name, shown beside its swatch. */
  readonly name: string;
  /** The entity's total in minor units. */
  readonly minor: number;
  /** The entity's fixed palette slot: its index in the person's type list, never its rank. */
  readonly slot: number;
}

export interface AllocationChartProps {
  /** Per-entity totals in any order: ranked largest first inside, colours by slot. */
  readonly segments: readonly AllocationSegment[];
  /** The ISO code the totals are denominated in. */
  readonly currency: string;
  /** What each row's figure reads: the compact amount, or the share of the total. */
  readonly mode: 'money' | 'percent';
  readonly testId?: string;
}

/** A full share spans 30% of the row, as the prototype's 72px bar does on a phone card. */
const BAR_WIDTH_PCT = 30;

/**
 * The allocation (design-system §5): a ranked list, not a donut. Name and figure sit beside every
 * swatch, which is what satisfies the light-mode relief rule. Colour follows the entity's fixed
 * slot, so filtering never repaints the survivors; past the eighth, entities fold into "Other".
 */
export function AllocationChart({
  segments,
  currency,
  mode,
  testId = 'allocation-chart',
}: AllocationChartProps) {
  const slices = allocation(segments);
  return (
    <ul className={styles.list} data-testid={testId}>
      {slices.map((slice) => (
        <li
          key={slice.other ? 'other' : slice.slot}
          className={styles.row}
          data-testid={`${testId}-row`}
        >
          <span
            className={styles.bar}
            style={{
              color: slice.other ? 'var(--ink-3)' : `var(--chart-${slice.slot + 1})`,
              width: `${((slice.shareBp / 10000) * BAR_WIDTH_PCT).toFixed(2)}%`,
            }}
            aria-hidden="true"
          />
          <span className={styles.name}>{slice.name}</span>
          <span className={styles.amount}>
            {mode === 'money'
              ? formatCompactMoney(slice.minor, currency)
              : `${(slice.shareBp / 100).toFixed(1)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}
