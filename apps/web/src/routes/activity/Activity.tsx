import type { AuditEntry, UndoResult } from '@netnet/contracts';
import type { UseMutationResult } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useActivity, useUndoBatch, useUndoEntry } from '../../api/activity';
import type { Written } from '../../api/client';
import { Waiting } from '../../app/guards';
import { Button, buttonClass, Card, ErrorState, useToast } from '../../components';
import { cx } from '../../components/cx';
import type { ErrorCopy } from '../../components/ErrorState';
import {
  actorLabel,
  conflictBlockers,
  conflictCopy,
  describeChange,
  formatInstant,
  groupActivity,
  turnClient,
  undoableOf,
  undoFailureCopy,
  type TurnGroup,
} from './activity';
import styles from './Activity.module.css';

/**
 * The Activity screen (PRD J7): everything the person or an agent changed, newest first and
 * grouped by agent turn, with what changed, old → new, who did it and when. One entry or a whole
 * turn undoes from here; a conflict names the newer change and offers to undo it first. An undo is
 * itself a log entry, so the log reads again from the top after one — and the snapshot refetches
 * from the response's dataVersion, so every total recomputes.
 */

type UndoMutation = Pick<
  UseMutationResult<Written<UndoResult>, Error, string>,
  'mutate' | 'isPending'
>;

/** One undo site's state: the conflict it is showing, or the failure, while an undo runs. */
function useUndoSite(undo: UndoMutation, undoFirst: UndoMutation, entry: AuditEntry) {
  const toast = useToast();
  const [conflict, setConflict] = useState<readonly string[] | null>(null);
  const [failure, setFailure] = useState<ErrorCopy | null>(null);

  const failed = (error: unknown) => {
    const ids = conflictBlockers(error);
    if (ids.length > 0) {
      setFailure(null);
      setConflict(ids);
    } else {
      setConflict(null);
      setFailure(undoFailureCopy(error, entry));
    }
  };

  return {
    conflict,
    failure,
    busy: undo.isPending || undoFirst.isPending,
    undo: (target: string, done: (undone: number) => string) => {
      setConflict(null);
      setFailure(null);
      undo.mutate(target, {
        onSuccess: (data) => toast.show({ message: done(data.result.undone.length) }),
        onError: failed,
      });
    },
    undoFirst: (blockerId: string) => {
      setFailure(null);
      undoFirst.mutate(blockerId, {
        onSuccess: () => {
          setConflict(null);
          toast.show({ message: 'Undone. Try the earlier change again.' });
        },
        onError: failed,
      });
    },
    dismiss: () => {
      setConflict(null);
      setFailure(null);
    },
  };
}

type UndoSite = ReturnType<typeof useUndoSite>;

/** The conflict or the failure beneath a row, in plain language, never a code or an id. */
function UndoNotice({ site, lookup }: { site: UndoSite; lookup: ReadonlyMap<string, AuditEntry> }) {
  const blockerId = site.conflict?.[0];
  if (blockerId !== undefined) {
    const copy = conflictCopy(lookup.get(blockerId));
    return (
      <div className={styles.notice} role="alert">
        <p className={styles.noticeText}>{copy.title}</p>
        <div className={styles.noticeActs}>
          <Button
            variant="outlined"
            aria-disabled={site.busy ? true : undefined}
            onClick={() => site.undoFirst(blockerId)}
          >
            {copy.action}
          </Button>
          <Button variant="quiet" onClick={site.dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  if (site.failure) {
    return (
      <div className={styles.notice} role="alert">
        <p className={styles.noticeText}>
          {site.failure.title} {site.failure.detail}
        </p>
        <div className={styles.noticeActs}>
          <Button variant="quiet" onClick={site.dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
  return null;
}

/** One entry: what changed, old → new, who did it and when, with its own Undo while it stands. */
function EntryRow({
  entry,
  lookup,
  showActor,
}: {
  entry: AuditEntry;
  lookup: ReadonlyMap<string, AuditEntry>;
  showActor: boolean;
}) {
  const site = useUndoSite(useUndoEntry(), useUndoEntry(), entry);
  const detail = describeChange(entry);
  const byAgent = entry.actor === 'agent';

  return (
    <div className={styles.block}>
      <div
        className={cx(styles.row, byAgent && styles.byAgent)}
        data-agent-written={byAgent || undefined}
      >
        <div className={styles.grow}>
          <p className={styles.summary}>{entry.summary}</p>
          {detail ? <p className={styles.detail}>{detail}</p> : null}
          <p className={styles.meta}>
            {showActor ? `${actorLabel(entry)} · ` : ''}
            {formatInstant(entry.at)}
          </p>
        </div>
        {entry.undoneBy === null ? (
          <Button
            variant="quiet"
            className={styles.undo}
            aria-label={`Undo: ${entry.summary}`}
            aria-disabled={site.busy ? true : undefined}
            onClick={() => site.undo(entry.id, () => 'Undone.')}
          >
            Undo
          </Button>
        ) : null}
      </div>
      <UndoNotice site={site} lookup={lookup} />
    </div>
  );
}

/** One agent turn: the writer, one control for the whole turn, and each entry with its own Undo. */
function TurnCard({
  group,
  lookup,
}: {
  group: TurnGroup;
  lookup: ReadonlyMap<string, AuditEntry>;
}) {
  const titleId = useId();
  const newest = group.entries[0];
  const site = useUndoSite(useUndoBatch(), useUndoEntry(), newest);
  const undoable = undoableOf(group);

  return (
    <Card flush as="section" aria-labelledby={titleId} className={styles.card}>
      <div className={styles.turnHead}>
        <h2 id={titleId} className={styles.turnTitle}>
          {turnClient(group) ?? 'An agent'}
        </h2>
        {undoable.length > 0 ? (
          <Button
            variant="outlined"
            aria-disabled={site.busy ? true : undefined}
            onClick={() =>
              site.undo(
                group.batchId,
                (undone) => `Undone ${undone === 1 ? '1 change' : `${undone} changes`}.`,
              )
            }
          >
            {`Undo these ${undoable.length === 1 ? '1 change' : `${undoable.length} changes`}`}
          </Button>
        ) : null}
      </div>
      {(site.conflict ?? site.failure) ? (
        <div className={styles.turnNotice}>
          <UndoNotice site={site} lookup={lookup} />
        </div>
      ) : null}
      {group.entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} lookup={lookup} showActor={false} />
      ))}
    </Card>
  );
}

export function Activity() {
  const log = useActivity();
  const emptyId = useId();
  const items = useMemo(() => log.data?.pages.flatMap((page) => page.items) ?? [], [log.data]);
  const lookup = useMemo(() => new Map(items.map((entry) => [entry.id, entry])), [items]);
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
            <TurnCard key={`${group.batchId}:${index}`} group={group} lookup={lookup} />
          ) : (
            <Card flush key={group.kind === 'turn' ? group.entries[0].id : group.entry.id}>
              <EntryRow
                entry={group.kind === 'turn' ? group.entries[0] : group.entry}
                lookup={lookup}
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
    </>
  );
}
