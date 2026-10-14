import type { Holding, PeriodView, Snapshot, Universal } from '@netnet/contracts';
import { PERIOD_VIEWS } from '@netnet/contracts';
import { useMemo, useState } from 'react';
import { BarChart, ChartPlaceholder, type BarDatum } from '../../charts';
import { Card } from '../../components';
import { cx } from '../../components/cx';
import { NO_VALUES_REASON } from './holding-data';
import {
  PERIOD_PAGE_SIZE,
  VIEW_LABELS,
  holdingPeriods,
  observedCount,
  pageCount,
  pageOf,
  periodLabel,
  periodShort,
  windowLabel,
} from './holding-periods';
import holdingStyles from './Holding.module.css';
import styles from './PeriodCard.module.css';

/** The plot's height in px, without the value or period labels — the trend's own. */
const CHART_HEIGHT = 160;

/** What makes the chart appear, per view, where the screen says it nowhere else. */
const VIEW_REASONS: Record<PeriodView, string> = {
  monthly: 'Update it in another month to compare months.',
  quarterly: 'Update it in another quarter to compare quarters.',
  yearly: 'Update it in another year to compare years.',
};

/**
 * The holding page's second card (PRD J4): a bar chart of the holding's period changes with a
 * monthly / quarterly / yearly switch and paging, from `core.periods` over this holding. The
 * switch and the paging are local state; with fewer than two periods carrying data the chart
 * keeps its place as the frosted placeholder, saying what makes it appear.
 */
export function PeriodCard({
  snapshot,
  holding,
  universal,
  today,
}: {
  snapshot: Snapshot;
  holding: Holding;
  universal: Universal;
  today: string;
}) {
  const [view, setView] = useState<PeriodView>('monthly');
  const [page, setPage] = useState(0);
  const periods = useMemo(
    () => holdingPeriods(snapshot, holding, universal, view, today),
    [snapshot, holding, universal, view, today],
  );

  const pages = pageCount(periods.length, PERIOD_PAGE_SIZE);
  const safePage = Math.min(page, pages - 1);
  const showing = pageOf(periods, safePage, PERIOD_PAGE_SIZE);
  const noEarlier = (safePage + 1) * PERIOD_PAGE_SIZE >= periods.length;
  const noLater = safePage === 0;
  const first = periods[0];
  const data: BarDatum[] = showing.map((period) => ({
    key: period.start,
    label: periodLabel(view, period),
    short: periodShort(view, period),
    // The oldest period has no earlier period to compare with: a tick, never a bar.
    value: period === first ? null : period.change,
    endValue: period.endValue,
    carried: period.carried,
  }));
  const carriedShown = showing.filter((period) => period.carried).length;
  const total = snapshot.values[holding.id]?.length ?? 0;

  const pickView = (next: PeriodView): void => {
    setView(next);
    setPage(0);
  };

  return (
    <section aria-labelledby="periods-heading">
      <div className={holdingStyles.sectionHead}>
        <h2 id="periods-heading">Period changes</h2>
      </div>
      {observedCount(periods) < 2 ? (
        <Card>
          <ChartPlaceholder
            kind="bars"
            height={CHART_HEIGHT}
            sub={total === 0 ? NO_VALUES_REASON : VIEW_REASONS[view]}
            testId="period-chart-placeholder"
          />
        </Card>
      ) : (
        <Card>
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Earlier periods"
              aria-disabled={noEarlier || undefined}
              onClick={() => {
                if (!noEarlier) setPage(safePage + 1);
              }}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span className={styles.window} data-testid="period-chart-window">
              {windowLabel(view, showing)}
            </span>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Later periods"
              aria-disabled={noLater || undefined}
              onClick={() => {
                if (!noLater) setPage(safePage - 1);
              }}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <BarChart
            bars={data}
            currency={snapshot.baseCurrency}
            height={CHART_HEIGHT}
            label="Period changes"
            testId="period-chart"
          />
          {carriedShown > 0 ? (
            <p className={styles.carried}>
              <b>Carried:</b>{' '}
              {carriedShown === 1
                ? 'nothing was recorded in this period, so the last value before it was used.'
                : 'nothing was recorded in those periods, so the last value before each was used.'}
            </p>
          ) : null}
          <div role="group" aria-label={`${holding.name} period view`} className={styles.switch}>
            {PERIOD_VIEWS.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(styles.segment, option === view && styles.on)}
                aria-pressed={option === view}
                onClick={() => pickView(option)}
              >
                {VIEW_LABELS[option]}
              </button>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
