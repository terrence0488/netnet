import type { PeriodView, Snapshot, UserType, VersionedPack } from '@netnet/contracts';
import { PERIOD_VIEWS } from '@netnet/contracts';
import { typeLabel } from '@netnet/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useMe } from '../../api/account';
import { trackClient } from '../../api/events';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import { AssetsLiabilitiesChart, ChartPlaceholder, RangeBar } from '../../charts';
import { Card, ErrorState, todayIn, usePackChain } from '../../components';
import { cx } from '../../components/cx';
import { homeData, type HomeData } from '../home/home-data';
import { DistributionChart } from './DistributionChart';
import {
  describeExclusions,
  describeInsightsFilter,
  INSIGHT_RANGES,
  isExclusionsActive,
  isInsightsFilterActive,
  PAGE_SIZE,
  VIEW_ADJECTIVE,
  VIEW_NOUN,
  VIEW_PLURAL,
} from './filtering';
import { InsightsFilterSheet, type FilterEntry as SheetEntry } from './FilterSheet';
import { GrowthChart } from './GrowthChart';
import {
  countedHoldings,
  distributionColumns,
  insightPeriods,
  insightSplits,
  insightSummary,
  OTHER_KEY,
  periodShort,
  periodWindow,
  rangedPeriods,
  windowLabel,
} from './insights-data';
import { Pager } from './Pager';
import { PeriodList } from './PeriodList';
import { useInsightsPrefs } from './prefs';
import { Summary } from './Summary';
import styles from './Insights.module.css';

/**
 * Insights (PRD J11): how each month, quarter and year actually went — period-end value,
 * change and drivers — through the person's own filters and exclusions, which persist and
 * never touch Home. Every figure comes from core, computed from the one snapshot over the
 * counted set.
 */

const CHART_HEIGHT = 180;

export function Insights() {
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return <InsightsLoaded snapshot={snapshot.data} timeZone={me.timeZone} />;
}

function InsightsLoaded({ snapshot, timeZone }: { snapshot: Snapshot; timeZone: string }) {
  const client = useQueryClient();
  const chain = usePackChain(snapshot.packRef);
  const today = todayIn(timeZone);
  const data = useMemo(() => homeData(snapshot, today), [snapshot, today]);

  if (chain.status === 'pending') {
    return (
      <>
        <InsightsTopBar />
        <Waiting />
      </>
    );
  }
  if (chain.status === 'error') {
    const retry = () => void client.refetchQueries({ queryKey: ['content'] });
    return (
      <>
        <InsightsTopBar />
        <ErrorState error={chain.error} onRetry={retry} />
      </>
    );
  }
  return <LoadedInsights snapshot={snapshot} data={data} chain={chain.packs} today={today} />;
}

function InsightsTopBar({
  onFilter,
  filterActive = false,
}: {
  readonly onFilter?: () => void;
  readonly filterActive?: boolean;
}) {
  return (
    <header className={styles.topbar}>
      <h1 className={styles.title}>Insights</h1>
      <span className={styles.spacer} />
      {onFilter ? (
        <button
          type="button"
          className={cx(styles.iconButton, filterActive && styles.active)}
          aria-label="Insights filters"
          onClick={onFilter}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.filterIcon}
          >
            <path d="M3 5h18l-7 8v6l-4 2v-8z" />
          </svg>
        </button>
      ) : null}
    </header>
  );
}

function LoadedInsights({
  snapshot,
  data,
  chain,
  today,
}: {
  snapshot: Snapshot;
  data: HomeData;
  chain: readonly VersionedPack[];
  today: string;
}) {
  const prefs = useInsightsPrefs(snapshot);
  const [view, setView] = useState<PeriodView>('monthly');
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState<{ view: PeriodView; start: string } | null>(null);

  useEffect(() => {
    void trackClient('insights_viewed', { view });
  }, [view]);

  const options = INSIGHT_RANGES[view];
  const capped = options.some((option) => option.value === range) ? range : 0;

  const all = useMemo(
    () => insightPeriods(data, view, today, prefs.filter, prefs.exclusions),
    [data, view, today, prefs.filter, prefs.exclusions],
  );
  const ranged = useMemo(() => rangedPeriods(all, capped, view, today), [all, capped, view, today]);
  const oldestFirst = useMemo(() => [...ranged].reverse(), [ranged]);
  const summary = useMemo(() => insightSummary(oldestFirst), [oldestFirst]);
  const { page: clampedPage, windowed } = useMemo(
    () => periodWindow(oldestFirst, page),
    [oldestFirst, page],
  );
  const splits = useMemo(
    () => insightSplits(oldestFirst, data, view, today, prefs.filter, prefs.exclusions),
    [oldestFirst, data, view, today, prefs.filter, prefs.exclusions],
  );

  const slots = useMemo(
    () => new Map(snapshot.types.map((type, slot) => [type.id, slot] as const)),
    [snapshot.types],
  );
  const columns = useMemo(
    () =>
      distributionColumns(
        data,
        windowed.map((period) => period.end),
        view,
        prefs.filter,
        prefs.exclusions,
        slots,
      ),
    [data, windowed, view, prefs.filter, prefs.exclusions, slots],
  );

  const typeLabels = useMemo(() => {
    const types = new Map<string, UserType>(snapshot.types.map((t) => [t.id, t]));
    return new Map(
      data.holdings.map((holding) => {
        const type = types.get(holding.typeId);
        return [
          holding.id,
          typeLabel(chain, {
            universal: type?.universal ?? holding.universal,
            packTypeKey: type?.packTypeKey ?? null,
            customName: type?.customName ?? null,
          }),
        ];
      }),
    );
  }, [snapshot.types, data.holdings, chain]);
  const allTypeLabels = useMemo(
    () =>
      new Map(
        snapshot.types.map((type) => [
          type.id,
          typeLabel(chain, {
            universal: type.universal,
            packTypeKey: type.packTypeKey,
            customName: type.customName,
          }),
        ]),
      ),
    [snapshot.types, chain],
  );
  const tagLabels = useMemo(
    () => new Map(snapshot.tags.map((tag) => [tag.id, tag.name])),
    [snapshot.tags],
  );
  const holdingLabels = useMemo(
    () => new Map(data.holdings.map((holding) => [holding.id, holding.name])),
    [data.holdings],
  );
  const labels = useMemo(
    () => ({ types: allTypeLabels, tags: tagLabels, holdings: holdingLabels }),
    [allTypeLabels, tagLabels, holdingLabels],
  );
  const labelOf = useMemo(() => {
    const ordered = snapshot.types.map((type) => allTypeLabels.get(type.id) ?? 'Other');
    return (key: string): string => {
      if (key === OTHER_KEY) return 'Other';
      return ordered[Number(key.slice('slot:'.length))] ?? 'Other';
    };
  }, [snapshot.types, allTypeLabels]);

  const filterTypes: SheetEntry[] = useMemo(
    () =>
      snapshot.types
        .filter((type) => !type.archived)
        .map((type) => ({ id: type.id, label: allTypeLabels.get(type.id) ?? 'Other' })),
    [snapshot.types, allTypeLabels],
  );
  const filterTags: SheetEntry[] = useMemo(
    () => snapshot.tags.map((tag) => ({ id: tag.id, label: tag.name })),
    [snapshot.tags],
  );
  const filterHoldings: SheetEntry[] = useMemo(
    () =>
      data.holdings
        .filter((holding) => !holding.archived)
        .map((holding) => ({ id: holding.id, label: holding.name })),
    [data.holdings],
  );

  const filterActive = isInsightsFilterActive(prefs.filter);
  const exclusionsActive = isExclusionsActive(prefs.exclusions);
  const counted = useMemo(
    () => countedHoldings(data, prefs.filter, prefs.exclusions),
    [data, prefs.filter, prefs.exclusions],
  );
  const tracked = useMemo(
    () => data.holdings.filter((holding) => !holding.archived).length,
    [data.holdings],
  );
  const filteredOut = counted === 0 && (filterActive || exclusionsActive);
  // A range always holds the newest period, which has a change whenever there are two, so the
  // range has an average whenever any view of this set would. Only the line chart, which needs
  // two period ends, can still ask for a longer range.
  const noHistory = summary === null;
  const placeholderLabel = filteredOut
    ? 'Nothing to show'
    : noHistory
      ? 'Need more data'
      : 'Pick a longer range';

  const noun = VIEW_NOUN[view].toLowerCase();
  const plural = VIEW_PLURAL[view];
  const window = windowLabel(windowed, view);
  const shorts = useMemo(
    () => windowed.map((period) => periodShort(view, period.end)),
    [windowed, view],
  );
  const noEarlier = (clampedPage + 1) * PAGE_SIZE >= oldestFirst.length;
  const noLater = clampedPage === 0;

  return (
    <>
      <InsightsTopBar
        onFilter={() => setSheet(true)}
        filterActive={filterActive || exclusionsActive}
      />
      <div className={styles.controls}>
        <div role="group" aria-label="View" className={styles.seg}>
          {PERIOD_VIEWS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={cx(styles.segment, candidate === view && styles.on)}
              aria-pressed={candidate === view}
              onClick={() => setView(candidate)}
            >
              {VIEW_ADJECTIVE[candidate]}
            </button>
          ))}
        </div>
        {!noHistory ? (
          <RangeBar label="Insights" options={options} value={capped} onChange={setRange} />
        ) : null}
      </div>

      {exclusionsActive ? (
        <div className={styles.banner}>
          <p className={styles.bannerText}>
            <b>Hidden here:</b> {describeExclusions(prefs.exclusions, labels)}. Your net worth on
            Home is unchanged.
          </p>
          <button type="button" className={styles.bannerButton} onClick={prefs.clearExclusions}>
            Clear
          </button>
        </div>
      ) : null}
      {filterActive ? (
        <div className={styles.banner}>
          <p className={styles.bannerText}>
            <b>Filtered{describeInsightsFilter(prefs.filter, labels) ? ':' : '.'}</b>
            {describeInsightsFilter(prefs.filter, labels)
              ? ` ${describeInsightsFilter(prefs.filter, labels)}.`
              : ' '}
            Every figure below covers the filtered set only.
          </p>
          <button type="button" className={styles.bannerButton} onClick={() => setSheet(true)}>
            Change
          </button>
          <button type="button" className={styles.bannerButton} onClick={() => prefs.setFilter({})}>
            Clear
          </button>
        </div>
      ) : null}

      <Summary
        filteredOut={filteredOut}
        tracked={tracked}
        noHistory={noHistory}
        noun={noun}
        plural={plural}
        summary={summary}
        currency={snapshot.baseCurrency}
      />

      <div className={styles.grid}>
        <section aria-labelledby="growth-heading" className={styles.growth}>
          <div className={styles.sectionHead}>
            <h2 id="growth-heading">{VIEW_ADJECTIVE[view]} growth</h2>
            {!noHistory ? (
              <Pager
                window={window}
                onEarlier={() => setPage(clampedPage + 1)}
                onLater={() => setPage(clampedPage - 1)}
                noEarlier={noEarlier}
                noLater={noLater}
                testId="growth-pager"
              />
            ) : null}
          </div>
          <Card>
            {noHistory ? (
              <ChartPlaceholder kind="bars" height={CHART_HEIGHT} label={placeholderLabel} />
            ) : (
              <GrowthChart
                values={windowed.map((period) => period.change)}
                shorts={shorts}
                currency={snapshot.baseCurrency}
                height={CHART_HEIGHT}
              />
            )}
          </Card>
        </section>

        <section aria-labelledby="assets-heading" className={styles.assets}>
          <div className={styles.sectionHead}>
            <h2 id="assets-heading">Assets vs liabilities</h2>
          </div>
          <Card>
            <AssetsLiabilitiesChart
              dates={oldestFirst.map((period) => period.end)}
              assets={splits.assets}
              liabilities={splits.liabilities.map((minor) => -minor)}
              netWorth={oldestFirst.map((period) => period.endValue)}
              currency={snapshot.baseCurrency}
              height={CHART_HEIGHT}
              emptyLabel={placeholderLabel}
            />
          </Card>
        </section>

        <section aria-labelledby="distribution-heading" className={styles.distribution}>
          <div className={styles.sectionHead}>
            <h2 id="distribution-heading">Distribution</h2>
            {!noHistory ? (
              <Pager
                window={window}
                onEarlier={() => setPage(clampedPage + 1)}
                onLater={() => setPage(clampedPage - 1)}
                noEarlier={noEarlier}
                noLater={noLater}
                testId="distribution-pager"
              />
            ) : null}
          </div>
          <Card>
            {noHistory ? (
              <ChartPlaceholder kind="stacked" height={CHART_HEIGHT} label={placeholderLabel} />
            ) : (
              <DistributionChart
                columns={columns}
                shorts={shorts}
                currency={snapshot.baseCurrency}
                height={CHART_HEIGHT}
                labelOf={labelOf}
              />
            )}
          </Card>
        </section>

        {ranged.length > 0 ? (
          <section aria-labelledby="periods-heading" className={styles.list}>
            <div className={styles.sectionHead}>
              <h2 id="periods-heading">
                {VIEW_NOUN[view]} by {noun}
              </h2>
            </div>
            <PeriodList
              periods={ranged}
              view={view}
              currency={snapshot.baseCurrency}
              noun={noun}
              typeLabelOf={(holdingId) => typeLabels.get(holdingId) ?? 'Other'}
              expanded={expanded?.view === view ? expanded.start : null}
              onToggle={(start) =>
                setExpanded(
                  expanded?.view === view && expanded.start === start ? null : { view, start },
                )
              }
            />
          </section>
        ) : null}
      </div>

      {sheet ? (
        <InsightsFilterSheet
          open
          onClose={() => setSheet(false)}
          filter={prefs.filter}
          exclusions={prefs.exclusions}
          types={filterTypes}
          tags={filterTags}
          holdings={filterHoldings}
          onApply={(draft) => prefs.apply(draft.filter, draft.exclusions)}
        />
      ) : null}
    </>
  );
}
