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
  AssetsLiabilitiesChart,
  TrendChart,
  formatCompactMoney,
} from '../../charts';
import {
  ageOf,
  Card,
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
import { homeData, sharedLockedUntil, visibleHoldings, type HomeData } from './home-data';
import { useHomePrefs } from './prefs';
import { sortHoldings, sortLabel } from './sort';
import { SortSheet } from './SortSheet';
import { StaleCard } from './StaleCard';
import styles from './Home.module.css';

/**
 * Home (PRD J4, the J5 handoff, J9): net worth with what it means — the trend and allocation, the
 * breakdown by type, assets vs liabilities, the position ledger, what needs updating, and the
 * holdings under it, every change figure against the baseline in force. Every figure comes from
 * core, computed from the one snapshot; the type labels follow the snapshot's pack chain.
 */

const CHART_HEIGHT = 160;
const TREND_REASON = 'Update a holding next month, or add an earlier value, to see your trend.';
const LINES_REASON =
  'Update a holding next month, or add an earlier value, to see assets against liabilities.';

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

  if (unarchived.length === 0) {
    return <EmptyHome baseCurrency={snapshot.baseCurrency} />;
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
}: {
  minor: number;
  currency: string;
  change: Change;
  baseline: Baseline;
  onBaseline: () => void;
}) {
  return (
    <div className={styles.hero}>
      <h1 className={styles.heroTitle}>Net worth</h1>
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
  const trend = useMemo(
    () => series(data.values, data.holdings, { to: today }, 'month', coreFilter),
    [data.values, data.holdings, today, coreFilter],
  );
  const byType = useMemo(
    () => series(data.values, data.holdings, { to: today }, 'month', coreFilter, 'type'),
    [data.values, data.holdings, today, coreFilter],
  );
  const byAccess = useMemo(
    () => series(data.values, data.holdings, { to: today }, 'month', coreFilter, 'access'),
    [data.values, data.holdings, today, coreFilter],
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
    () => sortHoldings(shown, prefs.sort, data.latest, changes),
    [shown, prefs.sort, data.latest, changes],
  );
  const staleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const holding of shown) {
      const latest = data.latest.get(holding.id);
      if (latest && staleness(holding, latest, today, chain).stale) ids.add(holding.id);
    }
    return ids;
  }, [shown, data.latest, today, chain]);
  const staleNames = useMemo(
    () => sorted.filter((holding) => staleIds.has(holding.id)).map((holding) => holding.name),
    [sorted, staleIds],
  );

  const typeGroups = byType.at(-1)?.groups ?? {};
  const breakdown = snapshot.types.filter((type) =>
    shown.some((holding) => holding.typeId === type.id),
  );
  const assetGroups = assetsByType.at(-1)?.groups ?? {};
  const segments = snapshot.types.flatMap((type, slot) => {
    const minor = assetGroups[type.id] ?? 0;
    if (minor <= 0) return [];
    return [{ name: allTypeLabels.get(type.id) ?? 'Other', minor, slot }];
  });

  const filterActive = isFilterActive(prefs.filter);
  const filterLeavesNothing = shown.length === 0;
  const emptyLabel = filterLeavesNothing ? 'Nothing to show' : 'Need more data';

  return (
    <>
      <HomeTopBar />
      <Hero
        minor={filtered.netWorth}
        currency={snapshot.baseCurrency}
        change={heroChange}
        baseline={prefs.baseline}
        onBaseline={() => setSheet('baseline')}
      />
      {filterActive ? (
        <div className={styles.banner}>
          <p className={styles.bannerText}>
            {describeHomeFilter(prefs.filter, { types: allTypeLabels, tags: tagLabels }) ||
              'Filtered'}
          </p>
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
                        points={trend}
                        currency={snapshot.baseCurrency}
                        height={CHART_HEIGHT}
                        emptyLabel={emptyLabel}
                        {...(filterLeavesNothing ? {} : { reason: TREND_REASON })}
                      />
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
                          </div>
                          <Card>
                            <AllocationChart
                              segments={segments}
                              currency={snapshot.baseCurrency}
                              mode="percent"
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
        {breakdown.length > 0 ? (
          <section aria-labelledby="by-type-heading" className={styles.byType}>
            <div className={styles.sectionHead}>
              <h2 id="by-type-heading">By type</h2>
            </div>
            <Card flush>
              {breakdown.map((type) => (
                <div key={type.id} className={styles.ledgerRow}>
                  <span className={styles.grow}>
                    <span className={styles.ledgerTitle}>
                      {allTypeLabels.get(type.id) ?? 'Other'}
                    </span>
                  </span>
                  <Figure minor={typeGroups[type.id] ?? 0} currency={snapshot.baseCurrency} total />
                </div>
              ))}
            </Card>
          </section>
        ) : null}
        <section aria-labelledby="lines-heading" className={styles.lines}>
          <div className={styles.sectionHead}>
            <h2 id="lines-heading">Assets vs liabilities</h2>
          </div>
          <Card>
            <AssetsLiabilitiesChart
              dates={byAccess.map((point) => point.date)}
              assets={byAccess.map((point) => point.total - (point.groups?.owed ?? 0))}
              liabilities={byAccess.map((point) => -(point.groups?.owed ?? 0))}
              netWorth={byAccess.map((point) => point.total)}
              currency={snapshot.baseCurrency}
              height={CHART_HEIGHT}
              emptyLabel={emptyLabel}
              {...(filterLeavesNothing ? {} : { reason: LINES_REASON })}
            />
          </Card>
        </section>
        {staleNames.length > 0 ? (
          <div className={styles.stale}>
            <StaleCard names={staleNames} />
          </div>
        ) : null}
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
              <button
                type="button"
                className={styles.tool}
                onClick={() => setSheet('filter')}
                aria-label={filterActive ? 'Filter Home. A filter is on' : 'Filter Home'}
              >
                Filter{filterActive ? ' · on' : ''} ▾
              </button>
            </div>
          </div>
          <p className={styles.listMeta}>Change vs {baselineLabel(prefs.baseline).toLowerCase()}</p>
          {sorted.length === 0 ? (
            <div className={styles.nothing}>
              <p>Nothing to show.</p>
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
      <FilterSheet
        open={sheet === 'filter'}
        onClose={closeSheet}
        filter={prefs.filter}
        types={filterTypes}
        tags={filterTags}
        onFilter={prefs.setFilter}
      />
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

/** `+$59K`, `−$1K`: a row's compact change money, signed (design-system §2.1). */
function signedCompact(minor: number, currency: string): string {
  const text = formatCompactMoney(minor, currency);
  return minor > 0 ? `+${text}` : text;
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
              ? signedCompact(rowChange.minor, baseCurrency)
              : formatChangePct(rowChange.pct)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
