import type { Period, PeriodView } from '@netnet/contracts';
import { Link } from 'react-router';
import { formatSignedCompactMoney } from '../../charts/format';
import { Card, Figure } from '../../components';
import { cx } from '../../components/cx';
import { formatDate } from '../../components/dates';
import { formatMoney } from '../../components/money';
import { formatChangePct } from '../home/change';
import { periodLabel } from './insights-data';
import styles from './PeriodList.module.css';

/**
 * The periods (PRD J11): newest first, each row carrying its change in money and % — period
 * rows are the one place a row carries both (design-system §2.1). Opening a period shows its
 * end value and the drivers ranked by contribution, in the default currency. A carried period
 * is marked as carried rather than observed, on the row and inside.
 */
export function PeriodList({
  periods,
  view,
  currency,
  noun,
  typeLabelOf,
  expanded,
  onToggle,
}: {
  /** The ranged periods, newest-first. */
  readonly periods: readonly Period[];
  readonly view: PeriodView;
  /** The default currency every figure is denominated in. */
  readonly currency: string;
  /** The view's noun in lowercase (`month`, `quarter`, `year`). */
  readonly noun: string;
  /** The type label per holding id. */
  readonly typeLabelOf: (holdingId: string) => string;
  /** The open period's start, or null. */
  readonly expanded: string | null;
  readonly onToggle: (start: string) => void;
}) {
  return (
    <>
      <Card flush>
        {periods.map((period, index) => (
          <PeriodRow
            key={period.start}
            period={period}
            view={view}
            currency={currency}
            noun={noun}
            typeLabelOf={typeLabelOf}
            newest={index === 0}
            open={expanded === period.start}
            onToggle={() => onToggle(period.start)}
          />
        ))}
      </Card>
      <p className={styles.dates}>Periods follow value dates, not when entries were made.</p>
    </>
  );
}

function PeriodRow({
  period,
  view,
  currency,
  noun,
  typeLabelOf,
  newest,
  open,
  onToggle,
}: {
  readonly period: Period;
  readonly view: PeriodView;
  readonly currency: string;
  readonly noun: string;
  readonly typeLabelOf: (holdingId: string) => string;
  readonly newest: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const moved = period.change !== 0;
  return (
    <>
      <button type="button" className={styles.row} aria-expanded={open} onClick={onToggle}>
        <span className={styles.grow}>
          <span className={styles.name}>
            {periodLabel(view, period.end)}
            {newest ? <span className={styles.chip}>so far</span> : null}
            {period.carried ? <span className={styles.carried}>Carried</span> : null}
          </span>
        </span>
        <span className={styles.amt}>
          {moved ? (
            <>
              <b className={cx(styles.change, period.change > 0 ? styles.gain : styles.loss)}>
                {formatSignedCompactMoney(period.change, currency)}
              </b>
              {period.changePct !== null ? (
                <span className={cx(styles.pct, period.change > 0 ? styles.gain : styles.loss)}>
                  {formatChangePct(period.changePct)}
                </span>
              ) : null}
            </>
          ) : (
            <span className={styles.flat}>—</span>
          )}
        </span>
      </button>
      {open ? (
        <PeriodDetail
          period={period}
          view={view}
          currency={currency}
          noun={noun}
          typeLabelOf={typeLabelOf}
          newest={newest}
        />
      ) : null}
    </>
  );
}

/**
 * An opened period: only what the row omits — the end value, the full change line, and what
 * drove it. Drivers link to their holdings, like the prototype's drill-down.
 */
function PeriodDetail({
  period,
  view,
  currency,
  noun,
  typeLabelOf,
  newest,
}: {
  readonly period: Period;
  readonly view: PeriodView;
  readonly currency: string;
  readonly noun: string;
  readonly typeLabelOf: (holdingId: string) => string;
  readonly newest: boolean;
}) {
  const moved = period.change !== 0;
  return (
    <div className={styles.detail}>
      <p className={styles.endLabel}>
        {periodLabel(view, period.end)}
        {newest ? ' · so far' : null}
      </p>
      <Figure size="display" minor={period.endValue} currency={currency} total />
      {moved ? (
        <p className={styles.changeLine}>
          <span className={cx(styles.change, period.change > 0 ? styles.gain : styles.loss)}>
            {formatMoney(period.change, currency, { signed: true })}
          </span>
          {period.changePct !== null ? (
            <span className={cx(styles.pct, period.change > 0 ? styles.gain : styles.loss)}>
              {` · ${formatChangePct(period.changePct)}`}
            </span>
          ) : null}
        </p>
      ) : (
        <p className={styles.changeLine}>No change this {noun}.</p>
      )}
      {newest ? <p className={styles.span}>{formatDate(period.start)} – today</p> : null}
      <h3 className={styles.driversTitle}>What drove it</h3>
      {period.drivers.length === 0 ? (
        <p className={styles.empty}>Nothing moved in this period.</p>
      ) : (
        <ul className={styles.drivers}>
          {period.drivers.map((driver) => (
            <li key={driver.holdingId}>
              <Link to={`/holdings/${driver.holdingId}`} className={styles.driver}>
                <span className={styles.grow}>
                  <span className={styles.name}>{driver.name}</span>
                  <span className={styles.sub}>{typeLabelOf(driver.holdingId)}</span>
                </span>
                <b
                  className={cx(
                    styles.contribution,
                    driver.contribution > 0 ? styles.gain : styles.loss,
                  )}
                >
                  {formatMoney(driver.contribution, currency, { signed: true })}
                </b>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {period.carried ? (
        <p className={styles.note}>
          <b>Carried:</b> a holding counted here has no value dated inside this period, so its last
          value before it was used.
        </p>
      ) : null}
    </div>
  );
}
