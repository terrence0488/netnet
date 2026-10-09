import { OTHER_GUIDE, type AgentConnection, type AgentGuide } from '@netnet/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { Waiting } from '../../app/guards';
import {
  AlternativeRoute,
  Button,
  Card,
  ErrorState,
  FormProblem,
  Sheet,
  errorCopy,
  useToast,
} from '../../components';
import { AgentIcon, AgentLogo } from '../../components/ConnectButton';
import { parseGuideClient } from '../../components/ConnectFlow';
import { guideFor, useAgentGuides, useConnections, useRevokeConnection } from './queries';
import styles from './Agent.module.css';

/**
 * The Agent tab (PRD J5): each connection's name, client, connected and last-used times, revoked
 * with a confirmation; the agents not yet connected as direct rows ("Connect your agent" when
 * empty, "Connect another" after). "Connect another agent" is always offered: any standard MCP
 * agent can connect, named or not. Beside it, what an agent can do.
 */

/** "today", "yesterday", "3 days ago", "2 weeks ago", "4 months ago", "2 years ago". */
export function daysAgo(days: number): string {
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 45) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
  }
  if (days < 400) {
    const months = Math.round(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
  }
  const years = days / 365;
  return `${years < 1.5 ? 'a year' : `${Math.round(years)} years`} ago`;
}

/** When something happened, in the viewer's words: "just now" up to daysAgo. */
export function timeAgo(iso: string, nowMs: number): string {
  const minutes = Math.max(0, (nowMs - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) {
    const rounded = Math.round(minutes);
    return rounded === 1 ? 'a minute ago' : `${rounded} minutes ago`;
  }
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  return daysAgo(Math.floor(minutes / 1440));
}

/** "12 Sep 2026": the day a connection was made, in the viewer's locale. */
export function connectedDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ConnectionCard({
  connection,
  guides,
}: {
  connection: AgentConnection;
  guides: readonly AgentGuide[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [now] = useState(() => Date.now());
  const revoke = useRevokeConnection();
  const toast = useToast();
  const guide = guideFor(guides, connection.client);
  const problem = revoke.isError ? errorCopy(revoke.error) : null;

  const disconnect = () => {
    revoke.mutate(connection.id, {
      onSuccess: () => {
        setConfirming(false);
        revoke.reset();
        toast.show({ message: `${connection.clientName} is disconnected.` });
      },
    });
  };
  const close = () => {
    if (revoke.isPending) return;
    setConfirming(false);
    revoke.reset();
  };

  return (
    <>
      <Card>
        <div className={styles.conn}>
          <span className={styles.dot} aria-hidden="true" />
          {guide ? <AgentLogo guide={guide} /> : <AgentIcon />}
          <h3 className={styles.name}>{connection.clientName}</h3>
        </div>
        <p className={styles.meta}>
          Connected {connectedDay(connection.createdAt)} · last used{' '}
          {connection.lastUsedAt === null ? 'not used yet' : timeAgo(connection.lastUsedAt, now)}
        </p>
        <div className={styles.acts}>
          <Button variant="outlined" className={styles.revoke} onClick={() => setConfirming(true)}>
            Revoke
          </Button>
        </div>
      </Card>
      <Sheet
        open={confirming}
        onClose={close}
        title={`Disconnect ${connection.clientName}?`}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Keep it
            </Button>
            <Button
              variant="primary"
              aria-disabled={revoke.isPending ? true : undefined}
              onClick={disconnect}
            >
              {revoke.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </>
        }
      >
        <p className={styles.sheetBody}>
          {connection.clientName} will no longer see or change your NetNet. What it added stays, and
          you can undo it.
        </p>
        {problem ? (
          <FormProblem>
            {problem.title} {problem.detail}
          </FormProblem>
        ) : null}
      </Sheet>
    </>
  );
}

export function Agent() {
  const guides = useAgentGuides();
  const connections = useConnections();
  const retry = () => {
    void guides.refetch();
    void connections.refetch();
  };

  if (guides.isPending || connections.isPending) {
    return (
      <>
        <header className={styles.top}>
          <h1>Your agent</h1>
        </header>
        <Waiting />
      </>
    );
  }
  if (guides.isError || connections.isError) {
    return (
      <>
        <header className={styles.top}>
          <h1>Your agent</h1>
        </header>
        <ErrorState error={guides.error ?? connections.error} onRetry={retry} />
      </>
    );
  }

  const list = connections.data;
  const offered = guides.data.filter((guide) => parseGuideClient(guide.id) !== null);
  const unconnected = offered.filter(
    (guide) => guide.id === OTHER_GUIDE || !list.some((c) => c.client === guide.id),
  );

  return (
    <>
      <header className={styles.top}>
        <h1>Your agent</h1>
      </header>
      <div className={styles.grid}>
        <div className={styles.main}>
          {list.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} guides={guides.data} />
          ))}
          {unconnected.length > 0 ? (
            <section aria-labelledby="connect-rows">
              <h2 id="connect-rows" className={styles.sectionTitle}>
                {list.length === 0 ? 'Connect your agent' : 'Connect another'}
              </h2>
              <Card flush>
                {unconnected.map((guide) => (
                  <Link
                    key={guide.id}
                    to={`/agent/connect/${guide.id}?entry=agent`}
                    className={styles.row}
                  >
                    <AgentLogo guide={guide} />
                    <span className={styles.rowName}>
                      {guide.id === OTHER_GUIDE ? 'Connect another agent' : `Connect ${guide.name}`}
                    </span>
                    <span aria-hidden="true" className={styles.chev}>
                      ›
                    </span>
                  </Link>
                ))}
              </Card>
            </section>
          ) : list.length === 0 ? (
            <AlternativeRoute entry="agent" />
          ) : null}
        </div>
        <div className={styles.side}>
          <section aria-labelledby="can-do">
            <h2 id="can-do" className={styles.sectionTitle}>
              What it can do
            </h2>
            <p className={styles.summary}>
              Anything you can do here — and you can undo anything it changes. Your statements stay
              with your agent; NetNet only receives the numbers.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
