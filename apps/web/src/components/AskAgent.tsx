import type { AgentConnection } from '@netnet/contracts';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { Button, buttonClass } from './Button';
import { connectHref, type ConnectEntry } from './ConnectButton';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';
import styles from './AskAgent.module.css';

/** The agent connections, for asking the agent and for the empty Home's other route. */
export const agentConnectionsQuery = queryOptions({
  queryKey: ['agent', 'connections'] as const,
  queryFn: ({ signal }) => api.get<AgentConnection[]>('/agent/connections', { signal }),
});

export function useAgentConnections() {
  return useQuery(agentConnectionsQuery);
}

/**
 * What to paste into the agent about a saved holding: it names the holding so the agent can find
 * it through the MCP layer, and carries no financial data.
 */
export function savedHoldingPrompt(name: string): string {
  return `Look at my “${name}” in NetNet. Help me work out whether it’s money I could use within a month, then update it.`;
}

/** What to paste while adding: the holding does not exist yet, so there is nothing to look at. */
export function newHoldingPrompt(name: string | null): string {
  const what = name ? `“${name}”` : 'a holding';
  return `I’m adding ${what} to NetNet. Help me work out whether it’s money I could use within a month, so I can answer.`;
}

export interface CopyState {
  readonly copied: boolean;
  readonly failed: boolean;
  readonly copy: (text: string) => void;
}

/** Copies text, saying whether it worked. */
export function useCopy(): CopyState {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = useCallback((text: string) => {
    try {
      void navigator.clipboard.writeText(text).then(
        () => setStatus('copied'),
        () => setStatus('failed'),
      );
    } catch {
      setStatus('failed');
    }
  }, []);
  return { copied: status === 'copied', failed: status === 'failed', copy };
}

/**
 * A message to take to the agent: a card with a mustard tab, Copy inside at bottom right — unless
 * the screen's primary action is already Copy, which passes `copyInside={false}`.
 */
export function PromptCard({
  text,
  copyInside = true,
}: {
  readonly text: string;
  readonly copyInside?: boolean;
}) {
  const { copied, failed, copy } = useCopy();
  return (
    <div>
      <div className={styles.promptCard}>
        <p className={styles.promptText}>{text}</p>
        {copyInside ? (
          <div className={styles.promptFoot}>
            <Button variant="quiet" onClick={() => copy(text)}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : null}
      </div>
      {failed ? (
        <p className={styles.failed} role="status">
          Copying didn’t work. Select the text to copy it.
        </p>
      ) : null}
    </div>
  );
}

function ClientNames({ connections }: { readonly connections: readonly AgentConnection[] }) {
  if (connections.length === 0) return <>Claude or ChatGPT</>;
  return <>{connections.map((c) => c.clientName).join(' or ')}</>;
}

/**
 * "Ask your agent" (PRD J2): with an agent connected, a copyable prompt with no financial data;
 * without one, the connect flow from the given entry (the holding page passes `holding`).
 */
export function AskAgentDialog({
  open,
  onClose,
  holdingName,
  saved,
  connectEntry = 'home',
  connectHoldingId = null,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The holding's name as typed or saved, or null before it has one. */
  readonly holdingName: string | null;
  /** Whether the holding exists (the agent can read it) or is still being added. */
  readonly saved: boolean;
  /** Where the connect flow starts from when none is connected. */
  readonly connectEntry?: ConnectEntry;
  /** The holding the flow returns to, for the `holding` entry. */
  readonly connectHoldingId?: string | null;
}) {
  const connections = useAgentConnections();
  const text = saved
    ? savedHoldingPrompt(holdingName ?? 'this holding')
    : newHoldingPrompt(holdingName);
  return (
    <Sheet open={open} onClose={onClose} title="Ask your agent">
      {connections.isPending ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : connections.isError || connections.data === undefined ? (
        <div className={styles.stack}>
          <p className={styles.explain}>NetNet can’t be reached. Check your connection.</p>
          <Button variant="outlined" onClick={() => void connections.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className={styles.stack}>
          <p className={styles.explain}>
            Paste this into <ClientNames connections={connections.data} />.{' '}
            {connections.data.length > 0
              ? saved
                ? 'It can read this holding, work it out with you, and set the answer — and every change it makes shows in Activity.'
                : 'Work it out together, then answer the question here.'
              : saved
                ? 'Connect it first, so it can see this holding.'
                : 'Connect it first.'}
          </p>
          <PromptCard text={text} />
          {connections.data.length === 0 ? (
            <Link
              to={connectHref(connectEntry, connectHoldingId)}
              className={buttonClass('primary', true)}
            >
              Connect your agent
            </Link>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
