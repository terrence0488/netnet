import type { AuditEntry } from '@netnet/contracts';
import { useId, useMemo } from 'react';
import { Link } from 'react-router';
import { useActivity } from '../../api/activity';
import { Waiting } from '../../app/guards';
import { Button, buttonClass, Card, ErrorState } from '../../components';
import { cx } from '../../components/cx';
import {
  actorLabel,
  describeChange,
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
 * through the agent, and that change reads here like any other.
 */

/** One entry: what changed, old → new, who did it and when. */
function EntryRow({ entry, showActor }: { entry: AuditEntry; showActor: boolean }) {
  const detail = describeChange(entry);
  const byAgent = entry.actor === 'agent';

  return (
    <div className={styles.block}>
      <div
        className={cx(styles.row, byAgent && styles.byAgent)}
        data-agent-written={byAgent || undefined}
      >
        <p className={styles.summary}>{entry.summary}</p>
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
function TurnCard({ group }: { group: TurnGroup }) {
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
        <EntryRow key={entry.id} entry={entry} showActor={false} />
      ))}
    </Card>
  );
}

export function Activity() {
  const log = useActivity();
  const emptyId = useId();
  const items = useMemo(() => log.data?.pages.flatMap((page) => page.items) ?? [], [log.data]);
  const retry = () => {
    void log.refetch();
  };

  if (log.isPending) {
    return (
      <>
        <header className={styles.top}>
          <h1>Activity</h1>
        </header>
        <Waiting />
      </>
    );
  }
  if (log.isError) {
    return (
      <>
        <header className={styles.top}>
          <h1>Activity</h1>
        </header>
        <ErrorState error={log.error} onRetry={retry} />
      </>
    );
  }
  if (items.length === 0) {
    return (
      <>
        <header className={styles.top}>
          <h1>Activity</h1>
        </header>
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
      </>
    );
  }

  return (
    <>
      <header className={styles.top}>
        <h1>Activity</h1>
      </header>
      <div className={styles.list}>
        {groupActivity(items).map((group, index) =>
          group.kind === 'turn' && group.entries.length > 1 ? (
            <TurnCard key={`${group.batchId}:${index}`} group={group} />
          ) : (
            <Card flush key={group.kind === 'turn' ? group.entries[0].id : group.entry.id}>
              <EntryRow entry={group.kind === 'turn' ? group.entries[0] : group.entry} showActor />
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
    </>
  );
}
