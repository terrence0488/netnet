import type { HoldingIn, Snapshot, UserType, ValueIn, VersionedPack } from '@netnet/contracts';
import { accessBucket, typeLabel } from '@netnet/core';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../api/account';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import {
  Button,
  Card,
  ErrorState,
  Figure,
  PromptCard,
  Rule,
  Spinner,
  Wordmark,
  ageOf,
  buttonClass,
  formatMoney,
  todayIn,
  useAgentConnections,
  useCopy,
  usePackChain,
} from '../../components';
import { cx } from '../../components/cx';
import { homeData, sharedLockedUntil, visibleHoldings, type HomeData } from './home-data';
import styles from './Home.module.css';

/**
 * Home (PRD J1, §2.2): net worth with what it means — what could be used, what is locked and
 * until when, what is owed — and the holdings under it. Every figure comes from core, computed
 * from the one snapshot; the type labels follow the snapshot's pack chain.
 */

/** The first message to the agent from a blank Home: it carries no financial data. */
export const START_PROMPT =
  'Help me set up NetNet. Ask me what I have, one thing at a time — round numbers are fine — and add it for me.';

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
  const shown = useMemo(() => visibleHoldings(data), [data]);

  if (shown.length === 0) {
    return (
      <>
        <TopBar />
        <Hero minor={0} currency={snapshot.baseCurrency} />
        <p className={styles.lead}>Nothing here yet.</p>
        <EmptyNext />
      </>
    );
  }
  if (chain.status === 'pending') {
    return (
      <>
        <TopBar />
        <Waiting />
      </>
    );
  }
  if (chain.status === 'error') {
    const retry = () => void client.refetchQueries({ queryKey: ['content'] });
    return (
      <>
        <TopBar />
        <ErrorState error={chain.error} onRetry={retry} />
      </>
    );
  }
  return (
    <LoadedHome snapshot={snapshot} data={data} shown={shown} chain={chain.packs} today={today} />
  );
}

function TopBar() {
  return (
    <div className={styles.topbar}>
      <Wordmark />
      <span className={styles.spacer} />
      <Link to="/add" className={styles.iconButton} aria-label="Add holding">
        <span aria-hidden="true">+</span>
      </Link>
    </div>
  );
}

function Hero({ minor, currency }: { minor: number; currency: string }) {
  return (
    <div className={styles.hero}>
      <h1 className={styles.heroTitle}>Net worth</h1>
      <Figure size="display" minor={minor} currency={currency} total />
    </div>
  );
}

function LoadedHome({
  snapshot,
  data,
  shown,
  chain,
  today,
}: {
  snapshot: Snapshot;
  data: HomeData;
  shown: HoldingIn[];
  chain: readonly VersionedPack[];
  today: string;
}) {
  const labels = useMemo(() => {
    const types = new Map<string, UserType>(snapshot.types.map((t) => [t.id, t]));
    return new Map(
      shown.map((holding) => {
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
  }, [snapshot.types, shown, chain]);

  return (
    <>
      <TopBar />
      <Hero minor={data.position.netWorth} currency={snapshot.baseCurrency} />
      <div className={styles.grid}>
        <section aria-labelledby="position-heading" className={styles.pos}>
          <div className={styles.sectionHead}>
            <h2 id="position-heading">Position</h2>
          </div>
          <PositionLedger
            data={data}
            shown={shown}
            labels={labels}
            baseCurrency={snapshot.baseCurrency}
          />
        </section>
        <section aria-labelledby="holdings-heading" className={styles.list}>
          <div className={styles.sectionHead}>
            <h2 id="holdings-heading">Holdings · {shown.length}</h2>
          </div>
          <Card flush>
            {shown.map((holding) => (
              <HoldingRow
                key={holding.id}
                holding={holding}
                label={labels.get(holding.id) ?? 'Other'}
                latest={data.latest.get(holding.id)}
                baseCurrency={snapshot.baseCurrency}
                today={today}
              />
            ))}
          </Card>
        </section>
      </div>
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
  shown,
  labels,
  baseCurrency,
}: {
  data: HomeData;
  shown: readonly HoldingIn[];
  labels: ReadonlyMap<string, string>;
  baseCurrency: string;
}) {
  const inBucket = (bucket: ReturnType<typeof accessBucket>) =>
    shown.filter((h) => accessBucket(h) === bucket);
  const { position } = data;
  const lockedTypes = [...new Set(inBucket('locked').map((h) => labels.get(h.id) ?? 'Other'))].join(
    ' · ',
  );
  const until = sharedLockedUntil(data, shown);
  const rows = [
    {
      key: 'couldUse',
      title: 'You could use this month',
      minor: position.couldUse,
      sub: bucketNames(inBucket('could_use')) || 'Nothing yet',
      owe: false,
    },
    ...(position.sellFirst
      ? [
          {
            key: 'sellFirst',
            title: 'You’d have to sell first',
            minor: position.sellFirst,
            sub: bucketNames(inBucket('sell_first')),
            owe: false,
          },
        ]
      : []),
    ...(position.locked
      ? [
          {
            key: 'locked',
            title: 'Locked away',
            minor: position.locked,
            sub: until ? `${lockedTypes} · ${until}` : lockedTypes,
            owe: false,
          },
        ]
      : []),
    ...(position.undecided
      ? [
          {
            key: 'undecided',
            title: 'Not decided yet',
            minor: position.undecided,
            sub: bucketNames(inBucket('undecided')),
            owe: false,
          },
        ]
      : []),
    ...(position.owed
      ? [
          {
            key: 'owed',
            title: 'You owe',
            minor: -position.owed,
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
  baseCurrency,
  today,
}: {
  holding: HoldingIn;
  label: string;
  latest: ValueIn | undefined;
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
        </span>
      </span>
      <span className={styles.amt}>
        <Figure minor={minor} currency={baseCurrency} total />
      </span>
    </Link>
  );
}

/** The empty Home (PRD J1): one primary action, and the agent as the genuine second route. */
function EmptyNext() {
  const connections = useAgentConnections();
  const { copied, failed, copy } = useCopy();

  if (connections.isPending) {
    return (
      <div className={styles.emptyNext}>
        <Link to="/add" className={buttonClass('primary', true)}>
          Add what you have
        </Link>
        <div className={styles.center}>
          <Spinner />
        </div>
      </div>
    );
  }
  const [first] = connections.data ?? [];
  if (connections.isError || !first) {
    return (
      <div className={styles.emptyNext}>
        <Link to="/add" className={buttonClass('primary', true)}>
          Add what you have
        </Link>
        <Rule variant="strong" />
        <div className={styles.alt}>
          <p className={styles.altTitle}>Let your AI agent do this</p>
          <p className={styles.altSub}>Works with Claude, or any agent that supports MCP.</p>
          <Link to="/agent/connect?entry=home" className={buttonClass('outlined', true)}>
            Connect to agent
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.emptyNext}>
      <p className={styles.emptyHint}>{first.clientName} is connected. Ask it to set things up:</p>
      <PromptCard text={START_PROMPT} copyInside={false} />
      <Button block onClick={() => copy(START_PROMPT)}>
        {copied ? 'Copied' : 'Copy the prompt'}
      </Button>
      {failed ? (
        <p role="status" className={styles.failed}>
          Copying didn’t work. Select the text to copy it.
        </p>
      ) : null}
      <Link to="/add" className={styles.plainLink}>
        Or add it yourself ›
      </Link>
    </div>
  );
}
