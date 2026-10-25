import type { AuditEntry, Pack, PackRef, Snapshot } from '@netnet/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useActivity } from '../../api/activity';
import { useSnapshot } from '../../api/snapshot';
import { Waiting } from '../../app/guards';
import { Button, buttonClass, Card, ErrorState, usePackChain } from '../../components';
import { cx } from '../../components/cx';
import {
  actorLabel,
  describeChange,
  entrySummary,
  formatInstant,
  groupActivity,
  turnClient,
  type TurnGroup,
} from './activity';
import styles from './Activity.module.css';

/**
 * The Activity screen (PRD J7): everything the person, an agent or NetNet changed, newest first
 * and grouped by agent turn, with what changed, old → new, who did it and when. It is a record
 * only: nothing here changes data. A mistake is corrected by another change, on the web or
 * through the agent, and that change reads here like any other. Types read by their labels in
 * the person's pack chain, as on every other screen.
 */

/** One entry: what changed, old → new, who did it and when. */
function EntryRow({
  entry,
  chain,
  showActor,
}: {
  entry: AuditEntry;
  chain: readonly Pack[];
  showActor: boolean;
}) {
  const detail = describeChange(entry, chain);
  const byAgent = entry.actor === 'agent';

  return (
    <div className={styles.block}>
      <div
        className={cx(styles.row, byAgent && styles.byAgent)}
        data-agent-written={byAgent || undefined}
      >
        <p className={styles.summary}>{entrySummary(entry)}</p>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
        <p className={styles.meta}>
          {showActor ? `${actorLabel(entry)} · ` : ''}
          {formatInstant(entry.at)}
        </p>
      </div>
    </div>
  );
}

/** One agent turn: the agent that wrote it, how many changes it made, and each of them. */
function TurnCard({ group, chain }: { group: TurnGroup; chain: readonly Pack[] }) {
  const titleId = useId();

  return (
    <Card flush as="section" aria-labelledby={titleId}>
      <div className={styles.turnHead}>
        <h2 id={titleId} className={styles.turnTitle}>
          {turnClient(group) ?? 'An agent'}
        </h2>
        <p className={styles.turnCount}>{`${group.entries.length} changes at once`}</p>
      </div>
      {group.entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} chain={chain} showActor={false} />
      ))}
    </Card>
  );
}

/** The screen's heading over what it shows: the log, or why it cannot yet. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.top}>
        <h1>Activity</h1>
      </header>
      {children}
    </>
  );
}

/** The log's query, its pages and paging, as `useActivity` gives it. */
type LogQuery = ReturnType<typeof useActivity>;

export function Activity() {
  // The log and the snapshot load together; the pack chain follows the snapshot's reference.
  const log = useActivity();
  const snapshot = useSnapshot<Snapshot>();
  if (log.isPending || snapshot.isPending) {
    return (
      <Screen>
        <Waiting />
      </Screen>
    );
  }
  if (log.isError) {
    return (
      <Screen>
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      </Screen>
    );
  }
  if (snapshot.isError || snapshot.data === undefined) {
    return (
      <Screen>
        <ErrorState error={snapshot.error} onRetry={() => void snapshot.refetch()} />
      </Screen>
    );
  }
  return <ActivityLoaded log={log} packRef={snapshot.data.packRef} />;
}

/** The log once the person's pack chain, which names their types, is in. */
function ActivityLoaded({ log, packRef }: { log: LogQuery; packRef: PackRef }) {
  const client = useQueryClient();
  const chain = usePackChain(packRef);
  if (chain.status === 'pending') {
    return (
      <Screen>
        <Waiting />
      </Screen>
    );
  }
  if (chain.status === 'error') {
    return (
      <Screen>
        <ErrorState
          error={chain.error}
          onRetry={() => void client.refetchQueries({ queryKey: ['content'] })}
        />
      </Screen>
    );
  }
  return <ActivityList log={log} chain={chain.packs} />;
}

function ActivityList({ log, chain }: { log: LogQuery; chain: readonly Pack[] }) {
  const emptyId = useId();
  const items = useMemo(() => log.data?.pages.flatMap((page) => page.items) ?? [], [log.data]);

  if (items.length === 0) {
    return (
      <Screen>
        <section className={styles.empty} aria-labelledby={emptyId}>
          <h2 id={emptyId} className={styles.emptyTitle}>
            Nothing has changed yet.
          </h2>
          <p className={styles.emptyBody}>
            Changes you or your agent make will show up here, newest first.
          </p>
          <Link to="/" className={buttonClass('outlined')}>
            Back to Home
          </Link>
        </section>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className={styles.list}>
        {groupActivity(items).map((group, index) =>
          group.kind === 'turn' && group.entries.length > 1 ? (
            <TurnCard key={`${group.batchId}:${index}`} group={group} chain={chain} />
          ) : (
            <Card flush key={group.kind === 'turn' ? group.entries[0].id : group.entry.id}>
              <EntryRow
                entry={group.kind === 'turn' ? group.entries[0] : group.entry}
                chain={chain}
                showActor
              />
            </Card>
          ),
        )}
      </div>
      {log.hasNextPage ? (
        <div className={styles.more}>
          <Button
            variant="outlined"
            aria-disabled={log.isFetchingNextPage || log.isFetching ? true : undefined}
            onClick={() => void log.fetchNextPage()}
          >
            {log.isFetchingNextPage ? 'Loading…' : 'Show older changes'}
          </Button>
        </div>
      ) : null}
    </Screen>
  );
}
