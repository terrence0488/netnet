import type { PeriodSummary } from '@netnet/core';
import { Link } from 'react-router';
import { formatSignedCompactMoney } from '../../charts';
import { cx } from '../../components/cx';
import { formatChangePct } from '../home/change';
import styles from './Summary.module.css';

/**
 * The summary line (the prototype's stat sentence): the average change while there is history
 * to compare — with its share of the opening total, unless that total was 0 — else the one
 * statement of what a comparison needs. When filters or exclusions leave nothing, it says that
 * instead, because more data would not help. Said once, never on the charts.
 */
export function Summary({
  filteredOut,
  tracked,
  noHistory,
  noun,
  plural,
  summary,
  currency,
}: {
  readonly filteredOut: boolean;
  readonly tracked: number;
  readonly noHistory: boolean;
  readonly noun: string;
  readonly plural: string;
  readonly summary: PeriodSummary | null;
  readonly currency: string;
}) {
  if (filteredOut) {
    return <p className={styles.summary}>Nothing matches these filters.</p>;
  }
  if (tracked === 0) {
    return (
      <p className={styles.summary}>
        Nothing tracked yet. Add what you have on <Link to="/">Home</Link> to start.
      </p>
    );
  }
  if (noHistory || summary === null) {
    return (
      <p className={styles.summary}>
        A {noun}-on-{noun} comparison needs two {plural} of values. It starts next {noun}, or now if
        you add an earlier value.
      </p>
    );
  }
  return (
    <p className={styles.summary}>
      Averaging{' '}
      <b
        className={cx(
          styles.figure,
          summary.avgAbs > 0 ? styles.gain : summary.avgAbs < 0 ? styles.loss : undefined,
        )}
      >
        {formatSignedCompactMoney(summary.avgAbs, currency)}
      </b>
      {summary.avgPct === null ? null : ` (${formatChangePct(summary.avgPct)})`} a {noun} over the
      last {summary.count} {summary.count === 1 ? noun : plural}.
    </p>
  );
}
