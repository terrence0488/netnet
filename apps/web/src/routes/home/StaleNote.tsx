import { Link } from 'react-router';
import { Button, useCopy } from '../../components';
import { buttonClass } from '../../components/Button';
import { HandoffWaiting, useAgentHandoff } from './AgentHandoff';
import { REFRESH_PROMPT, prefillHref } from './prompts';
import styles from './StaleNote.module.css';

/**
 * Out-of-date holdings (PRD J9): how many are out of date, and one tap handing the job to the
 * connected agent — prefilled where the client supports it, copied where not. Without an agent,
 * the way to keep it current is to connect one. The prompt carries no data: the agent finds what
 * is stale itself, through the MCP layer.
 */
export function StaleNote({ count }: { readonly count: number }) {
  const handoff = useAgentHandoff();
  const { copied, failed, copy } = useCopy();
  const them = count > 1 ? 'them' : 'it';
  return (
    <div className={styles.note}>
      <p className={styles.head}>
        <b>
          {count} holding{count > 1 ? 's are' : ' is'} out of date.
        </b>
      </p>
      {handoff.status === 'pending' ? (
        <HandoffWaiting />
      ) : handoff.status === 'none' ? (
        <Link to="/agent/connect?entry=home" className={buttonClass('quiet')}>
          Connect your agent to keep it current
        </Link>
      ) : handoff.guide?.prefillUrl ? (
        <a
          className={buttonClass('quiet')}
          href={prefillHref(handoff.guide.prefillUrl, REFRESH_PROMPT)}
          target="_blank"
          rel="noreferrer"
        >
          Ask {handoff.connection.clientName} to update {them}
        </a>
      ) : (
        <Button variant="quiet" onClick={() => copy(REFRESH_PROMPT)}>
          {copied ? 'Copied' : `Copy a prompt for ${handoff.connection.clientName}`}
        </Button>
      )}
      {failed ? (
        <p role="status" className={styles.failed}>
          Copying didn’t work. Select the text to copy it.
        </p>
      ) : null}
    </div>
  );
}
