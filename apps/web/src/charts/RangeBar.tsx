import { cx } from '../components/cx';
import styles from './RangeBar.module.css';

export interface RangeOption<V extends number> {
  readonly label: string;
  readonly value: V;
}

export interface RangeBarProps<V extends number> {
  /** The chart this range bar covers, naming the group. */
  readonly label: string;
  readonly options: readonly RangeOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
}

/**
 * A trend's range bar (design-system §5): All / 6M / YTD / 1Y / 2Y / 4Y / 8Y under the chart.
 * The range in force is an ink pill; every cell is the full hit target.
 */
export function RangeBar<V extends number>({ label, options, value, onChange }: RangeBarProps<V>) {
  return (
    <div role="group" aria-label={`${label} range`} className={styles.bar}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          className={cx(styles.cell, option.value === value && styles.on)}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          <span className={styles.pill}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
