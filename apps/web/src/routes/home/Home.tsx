import type {
  Baseline,
  Change,
  HoldingIn,
  Position,
  Snapshot,
  UserType,
  ValueIn,
  VersionedPack,
} from '@netnet/contracts';
import { accessBucket, baselineChange, position, series, staleness, typeLabel } from '@netnet/core';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../api/account';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  AllocationChart,
  RangeBar,
  TREND_RANGES,
  TrendChart,
  formatSignedCompactMoney,
} from '../../charts';
import {
  ageOf,
  Card,
  currencySymbol,
  ErrorState,
  Figure,
  formatMoney,
  todayIn,
  usePackChain,
} from '../../components';
import { cx } from '../../components/cx';
import { baselineLabel } from './baselines';
import { BaselineSheet } from './BaselineSheet';
import { Carousel } from './Carousel';
import { formatChangePct, rowChangeShown } from './change';
import { EmptyHome, HomeTopBar } from './EmptyHome';
import { asHoldingFilter, describeHomeFilter, isFilterActive } from './filtering';
import { FilterSheet, type FilterEntry } from './FilterSheet';
import {
  homeData,
  homeTrendFrom,
  sharedLockedUntil,
  visibleHoldings,
  type HomeData,
} from './home-data';
import { useHomePrefs } from './prefs';
import { PushCard } from './PushCard';
import { sortHoldings, sortLabel } from './sort';
import { SortSheet } from './SortSheet';
import { StaleNote } from './StaleNote';
import styles from './Home.module.css';

/**
 * Home (PRD J4, the J5 handoff, J9): net worth with what it means — the trend and allocation,
 * the position ledger, what needs updating, and the holdings under it, every change figure
 * against the baseline in force. Every figure comes from core, computed from the one snapshot;
 * the type labels follow the snapshot's pack chain.
 */

const CHART_HEIGHT = 160;
const TREND_REASON = 'Update a holding next month, or add an earlier value, to see your trend.';

export function Home() {
  const me = useMe().data;
  const snapshot = useSnapshot<Snapshot>();
  if (!me || snapshot.isPending) return <Waiting />;
  if (snapshot.isError || snapshot.data === undefined) {
    return <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />;
  }
  return <HomeLoaded snapshot={snapshot.data} timeZone={me.timeZone} />;
}

function HomeLoaded({ snapshot, timeZone }: { snapshot: Snapshot; timeZone: string }) {
  const client = useQueryClient();
  const chain = usePackChain(snapshot.packRef);
  const today = todayIn(timeZone);
  const data = useMemo(() => homeData(snapshot, today), [snapshot, today]);
  const unarchived = useMemo(() => visibleHoldings(data), [data]);
  const archived = useMemo(
    () => data.holdings.filter((holding) => holding.archived).length,
    [data.holdings],
  );

  if (unarchived.length === 0) {
    return <EmptyHome baseCurrency={snapshot.baseCurrency} archivedCount={archived} />;
  }
  if (chain.status === 'pending') {
    return (
      <>
        <HomeTopBar />
        <Waiting />
      </>
    );
  }
  if (chain.status === 'error') {
    const retry = () => void client.refetchQueries({ queryKey: ['content'] });
    return (
      <>
        <HomeTopBar />
        <ErrorState error={chain.error} onRetry={retry} />
      </>
    );
  }
  return <LoadedHome snapshot={snapshot} data={data} chain={chain.packs} today={today} />;
}

function Hero({
  minor,
  currency,
  change,
  baseline,
  onBaseline,
  filtered,
}: {
  minor: number;
  currency: string;
  change: Change;
  baseline: Baseline;
  onBaseline: () => void;
  filtered: boolean;
}) {
  return (
    <div className={styles.hero}>
      <h1 className={styles.heroTitle}>{filtered ? 'Filtered total' : 'Net worth'}</h1>
      <Figure size="display" minor={minor} currency={currency} total />
      <ChangeLine change={change} currency={currency} baseline={baseline} onBaseline={onBaseline} />
    </div>
  );
}

/**
 * The change line (design-system §6): signed money · percentage on a cream sticker, then the
 * baseline control. No figure at all when nothing changed.
 */
function ChangeLine({
  change,
  currency,
  baseline,
  onBaseline,
}: {
  change: Change;
  currency: string;
  baseline: Baseline;
  onBaseline: () => void;
}) {
  const figure =
    change.amount !== null && change.amount !== 0 ? (
      <span className={styles.sticker}>
        <Figure size="change" minor={change.amount} currency={currency} />
        {change.pct !== null ? (
          <>
            {' · '}
            <span className={cx(styles.pct, change.pct > 0 ? styles.gain : styles.loss)}>
              {formatChangePct(change.pct)}
            </span>
          </>
        ) : null}
      </span>
    ) : null;
  return (
    <p className={styles.changeLine}>
      {figure}
      {figure ? ' ' : null}
      <button type="button" className={styles.vs} onClick={onBaseline}>
        vs {baselineLabel(baseline)} ▾
      </button>
    </p>
  );
}

function LoadedHome({
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
  const prefs = useHomePrefs(snapshot);
  const [sheet, setSheet] = useState<'baseline' | 'sort' | 'filter' | null>(null);
  const closeSheet = () => setSheet(null);
  const [allocMode, setAllocMode] = useState<'money' | 'percent'>('percent');
  const [range, setRange] = useState(0);

  const coreFilter = useMemo(() => asHoldingFilter(prefs.filter), [prefs.filter]);
  const shown = useMemo(() => visibleHoldings(data, coreFilter), [data, coreFilter]);
  const valuesByHolding = useMemo(() => {
    const grouped = new Map<string, ValueIn[]>();
    for (const value of data.values) {
      const track = grouped.get(value.holdingId);
      if (track) track.push(value);
      else grouped.set(value.holdingId, [value]);
    }
    return grouped;
  }, [data.values]);
  const changes = useMemo(() => {
    const byId = new Map<string, Change>();
    for (const holding of shown) {
      byId.set(
        holding.id,
        baselineChange(valuesByHolding.get(holding.id) ?? [], [holding], prefs.baseline, today),
      );
    }
    return byId;
  }, [shown, valuesByHolding, prefs.baseline, today]);
  const heroChange = useMemo(
    () => baselineChange(data.values, data.holdings, prefs.baseline, today, coreFilter),
    [data.values, data.holdings, prefs.baseline, today, coreFilter],
  );
  const filtered = useMemo(
    () => position(data.holdings, data.latest, coreFilter),
    [data.holdings, data.latest, coreFilter],
  );
  const from = useMemo(
    () => homeTrendFrom(shown, valuesByHolding, today, range),
    [shown, valuesByHolding, today, range],
  );
  const trend = useMemo(
    () =>
      series(
        data.values,
        data.holdings,
        from === undefined ? { to: today } : { from, to: today },
        'month',
        coreFilter,
      ),
    [data.values, data.holdings, from, today, coreFilter],
  );
  const hasHistory = useMemo(
    () => shown.some((holding) => (valuesByHolding.get(holding.id) ?? []).length > 1),
    [shown, valuesByHolding],
  );
  // The allocation holds asset totals only: with the filter on liabilities, there is no
  // allocation and the trend stands alone.
  const assetsByType = useMemo(
    () =>
      prefs.filter.show === 'liabilities'
        ? []
        : series(
            data.values,
            data.holdings,
            { to: today },
            'month',
            { ...coreFilter, show: 'assets' },
            'type',
          ),
    [data.values, data.holdings, today, coreFilter, prefs.filter.show],
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
  const filterTypes: FilterEntry[] = useMemo(
    () =>
      snapshot.types
        .filter((type) => !type.archived)
        .map((type) => ({ id: type.id, label: allTypeLabels.get(type.id) ?? 'Other' })),
    [snapshot.types, allTypeLabels],
  );
  const filterTags: FilterEntry[] = useMemo(
    () => snapshot.tags.map((tag) => ({ id: tag.id, label: tag.name })),
    [snapshot.tags],
  );

  const sorted = useMemo(
    () =>
      sortHoldings(
        shown,
        prefs.sort,
        data.latest,
        changes,
        (typeId) => allTypeLabels.get(typeId) ?? 'Other',
      ),
    [shown, prefs.sort, data.latest, changes, allTypeLabels],
  );
  const staleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const holding of shown) {
      const latest = data.latest.get(holding.id);
      if (latest && staleness(holding, latest, today, chain).stale) ids.add(holding.id);
    }
    return ids;
  }, [shown, data.latest, today, chain]);
  const staleCount = useMemo(
    () => sorted.filter((holding) => staleIds.has(holding.id)).length,
    [sorted, staleIds],
  );
  const archivedCount = useMemo(
    () => snapshot.holdings.filter((holding) => holding.archived).length,
    [snapshot.holdings],
  );

  const assetGroups = assetsByType.at(-1)?.groups ?? {};
  const segments = snapshot.types.flatMap((type, slot) => {
    const minor = assetGroups[type.id] ?? 0;
    if (minor <= 0) return [];
    return [{ name: allTypeLabels.get(type.id) ?? 'Other', minor, slot }];
  });

  const filterActive = isFilterActive(prefs.filter);
  const bannerText = useMemo(() => {
    const summary = describeHomeFilter(prefs.filter, {
      types: allTypeLabels,
      tags: tagLabels,
    });
    return summary ? `Filtered: ${summary}` : 'Filtered';
  }, [prefs.filter, allTypeLabels, tagLabels]);
  const filterLeavesNothing = shown.length === 0;
  const emptyLabel = filterLeavesNothing ? 'Nothing matches this filter.' : 'Need more data';

  return (
    <>
      <HomeTopBar onFilter={() => setSheet('filter')} filterActive={filterActive} />
      <Hero
        minor={filtered.netWorth}
        currency={snapshot.baseCurrency}
        change={heroChange}
        baseline={prefs.baseline}
        onBaseline={() => setSheet('baseline')}
        filtered={filterActive}
      />
      {filterActive ? (
        <div className={styles.banner}>
          <p className={styles.bannerText}>{bannerText}</p>
          <button type="button" className={styles.bannerButton} onClick={() => setSheet('filter')}>
            Change
          </button>
          <button type="button" className={styles.bannerButton} onClick={() => prefs.setFilter({})}>
            Clear
          </button>
        </div>
      ) : null}
      <div className={styles.grid}>
        <div className={styles.carousel}>
          <Carousel
            slides={[
              {
                key: 'trend',
                label: 'Trend',
                node: (
                  <section aria-labelledby="trend-heading">
                    <div className={styles.sectionHead}>
                      <h2 id="trend-heading">Trend</h2>
                    </div>
                    <Card>
                      <TrendChart
                        points={hasHistory ? trend : []}
                        currency={snapshot.baseCurrency}
                        height={CHART_HEIGHT}
                        emptyLabel={emptyLabel}
                        {...(filterLeavesNothing ? {} : { reason: TREND_REASON })}
                      />
                      {hasHistory ? (
                        <RangeBar
                          label={filterActive ? 'Filtered total' : 'Net worth'}
                          options={TREND_RANGES}
                          value={range}
                          onChange={setRange}
                        />
                      ) : null}
                    </Card>
                  </section>
                ),
              },
              ...(segments.length >= 2
                ? [
                    {
                      key: 'allocation',
                      label: 'Allocation',
                      node: (
                        <section aria-labelledby="allocation-heading">
                          <div className={styles.sectionHead}>
                            <h2 id="allocation-heading">Allocation</h2>
                            <button
                              type="button"
                              className={styles.modeToggle}
                              onClick={() =>
                                setAllocMode(allocMode === 'percent' ? 'money' : 'percent')
                              }
                            >
                              {allocMode === 'percent'
                                ? `Show ${currencySymbol(snapshot.baseCurrency)}`
                                : 'Show %'}
                            </button>
                          </div>
                          <Card>
                            <AllocationChart
                              segments={segments}
                              currency={snapshot.baseCurrency}
                              mode={allocMode}
                            />
                          </Card>
                        </section>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <div className={styles.side}>
          <section aria-labelledby="position-heading" className={styles.pos}>
            <div className={styles.sectionHead}>
              <h2 id="position-heading">Position</h2>
            </div>
            <PositionLedger
              data={data}
              totals={filtered}
              shown={shown}
              labels={typeLabels}
              baseCurrency={snapshot.baseCurrency}
            />
          </section>
          {/* The note qualifies the figures above it, so it comes before the card's offer. */}
          {staleCount > 0 ? <StaleNote count={staleCount} /> : null}
          <PushCard />
        </div>
        <section aria-labelledby="holdings-heading" className={styles.list}>
          <div className={styles.sectionHead}>
            <h2 id="holdings-heading">Holdings · {sorted.length}</h2>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.tool}
                onClick={() => setSheet('sort')}
                aria-label={`Sort holdings. Now: ${sortLabel(prefs.sort)}`}
              >
                Sort: {sortLabel(prefs.sort)} ▾
              </button>
            </div>
          </div>
          <p className={styles.listMeta}>Change vs {baselineLabel(prefs.baseline).toLowerCase()}</p>
          {sorted.length === 0 ? (
            <div className={styles.nothing}>
              <p>Nothing matches this filter.</p>
              <button
                type="button"
                className={styles.bannerButton}
                onClick={() => prefs.setFilter({})}
              >
                Clear the filter
              </button>
            </div>
          ) : (
            <Card flush>
              {sorted.map((holding) => (
                <HoldingRow
                  key={holding.id}
                  holding={holding}
                  label={typeLabels.get(holding.id) ?? 'Other'}
                  latest={data.latest.get(holding.id)}
                  change={changes.get(holding.id)}
                  byPct={prefs.sort === 'change_pct'}
                  stale={staleIds.has(holding.id)}
                  baseCurrency={snapshot.baseCurrency}
                  today={today}
                />
              ))}
            </Card>
          )}
          {archivedCount > 0 ? (
            <div className={styles.listFoot}>
              <Link to="/archived" className={styles.footLink}>
                {archivedCount} archived ›
              </Link>
            </div>
          ) : null}
        </section>
      </div>
      <BaselineSheet
        open={sheet === 'baseline'}
        onClose={closeSheet}
        baseline={prefs.baseline}
        onBaseline={prefs.setBaseline}
      />
      <SortSheet
        open={sheet === 'sort'}
        onClose={closeSheet}
        sort={prefs.sort}
        onSort={prefs.setSort}
      />
      {sheet === 'filter' ? (
        <FilterSheet
          open
          onClose={closeSheet}
          filter={prefs.filter}
          types={filterTypes}
          tags={filterTags}
          onFilter={prefs.setFilter}
        />
      ) : null}
    </>
  );
}

const bucketNames = (holdings: readonly HoldingIn[]): string => {
  const names = holdings.map((h) => h.name);
  return names.length > 3
    ? `${names.slice(0, 2).join(' · ')} · +${names.length - 2} more`
    : names.join(' · ');
};

/** The position as a ledger: what could be used, what needs selling, locked, undecided, owed. */
function PositionLedger({
  data,
  totals,
  shown,
  labels,
  baseCurrency,
}: {
  data: HomeData;
  totals: Position;
  shown: readonly HoldingIn[];
  labels: ReadonlyMap<string, string>;
  baseCurrency: string;
}) {
  const inBucket = (bucket: ReturnType<typeof accessBucket>) =>
    shown.filter((h) => accessBucket(h) === bucket);
  const lockedTypes = [...new Set(inBucket('locked').map((h) => labels.get(h.id) ?? 'Other'))].join(
    ' · ',
  );
  const until = sharedLockedUntil(data, shown);
  const rows = [
    {
      key: 'couldUse',
      title: 'You could use this month',
      minor: totals.couldUse,
      sub: bucketNames(inBucket('could_use')) || 'Nothing yet',
      owe: false,
    },
    ...(totals.sellFirst
      ? [
          {
            key: 'sellFirst',
            title: 'You’d have to sell first',
            minor: totals.sellFirst,
            sub: bucketNames(inBucket('sell_first')),
            owe: false,
          },
        ]
      : []),
    ...(totals.locked
      ? [
          {
            key: 'locked',
            title: 'Locked away',
            minor: totals.locked,
            sub: until ? `${lockedTypes} · ${until}` : lockedTypes,
            owe: false,
          },
        ]
      : []),
    ...(totals.undecided
      ? [
          {
            key: 'undecided',
            title: 'Not decided yet',
            minor: totals.undecided,
            sub: bucketNames(inBucket('undecided')),
            owe: false,
          },
        ]
      : []),
    ...(totals.owed
      ? [
          {
            key: 'owed',
            title: 'You owe',
            minor: -totals.owed,
            sub: bucketNames(inBucket('owed')),
            owe: true,
          },
        ]
      : []),
  ];
  return (
    <Card flush>
      {rows.map((row) => (
        <div key={row.key} className={cx(styles.ledgerRow, row.owe && styles.owe)}>
          <span className={styles.grow}>
            <span className={styles.ledgerTitle}>{row.title}</span>
            {row.sub ? <span className={styles.ledgerSub}>{row.sub}</span> : null}
          </span>
          <Figure minor={row.minor} currency={baseCurrency} total />
        </div>
      ))}
    </Card>
  );
}

function HoldingRow({
  holding,
  label,
  latest,
  change,
  byPct,
  stale,
  baseCurrency,
  today,
}: {
  holding: HoldingIn;
  label: string;
  latest: ValueIn | undefined;
  change: Change | undefined;
  byPct: boolean;
  stale: boolean;
  baseCurrency: string;
  today: string;
}) {
  const foreign = latest && latest.currency !== baseCurrency;
  const byAgent = latest?.source === 'agent';
  const undecided = holding.kind === 'asset' && (holding.access ?? 'undecided') === 'undecided';
  const sub = [
    label,
    foreign ? formatMoney(latest.amountMinor, latest.currency, { code: true }) : null,
    latest ? ageOf(latest.date, today) : 'no value yet',
  ]
    .filter((part) => part !== null)
    .join(' · ');
  const minor = latest ? (holding.kind === 'liability' ? -latest.baseMinor : latest.baseMinor) : 0;
  const rowChange = change ? rowChangeShown(change, byPct) : null;
  return (
    <Link
      to={`/holdings/${holding.id}`}
      className={cx(styles.row, byAgent && styles.byAgent)}
      data-agent-written={byAgent || undefined}
    >
      <span className={styles.grow}>
        <span className={styles.name}>{holding.name}</span>
        <span className={styles.sub}>
          {sub}
          {undecided ? (
            <>
              {' · '}
              <span className={styles.chip}>Not decided</span>
            </>
          ) : null}
          {stale ? (
            <>
              {' · '}
              <span className={styles.chip}>Stale</span>
            </>
          ) : null}
        </span>
      </span>
      <span className={styles.amt}>
        <Figure minor={minor} currency={baseCurrency} total />
        {rowChange ? (
          <span
            className={cx(
              styles.pct,
              (rowChange.kind === 'money' ? rowChange.minor : rowChange.pct) > 0
                ? styles.gain
                : styles.loss,
            )}
          >
            {rowChange.kind === 'money'
              ? formatSignedCompactMoney(rowChange.minor, baseCurrency)
              : formatChangePct(rowChange.pct)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
