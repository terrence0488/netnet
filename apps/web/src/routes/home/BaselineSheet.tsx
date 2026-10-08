import type { Baseline } from '@netnet/contracts';
import { useId } from 'react';
import { Choice, Sheet } from '../../components';
import { BASELINE_OPTIONS } from './baselines';
import styles from './BaselineSheet.module.css';

/**
 * The baseline selector (PRD J4): what every change figure and percentage on Home is measured
 * against. One choice, applied at once.
 */
export function BaselineSheet({
  open,
  onClose,
  baseline,
  onBaseline,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly baseline: Baseline;
  readonly onBaseline: (baseline: Baseline) => void;
}) {
  const labelId = useId();
  return (
    <Sheet open={open} onClose={onClose} title="Compare with">
      <p id={labelId} className={styles.question}>
        Every change on Home is measured against:
      </p>
      <Choice
        stacked
        labelledBy={labelId}
        options={BASELINE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        value={baseline}
        onChange={(value) => {
          onBaseline(value);
          onClose();
        }}
      />
    </Sheet>
  );
}
