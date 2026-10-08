import { Link } from 'react-router';
import { Card } from '../../components';
import { buttonClass } from '../../components/Button';
import { HandoffPrompt, HandoffWaiting, useAgentHandoff } from './AgentHandoff';
import { staleUpdatePrompt } from './prompts';
import styles from './StaleCard.module.css';

/**
 * What needs updating (PRD J9): the stale count, what is stale, and the next step handed to the
 * connected agent — the update prompt naming what is stale, prefilled where the client supports
 * it, copied where not. Without an agent, the same place offers to connect one. Names only:
 * never an amount.
 */

const SHOWN_NAMES = 6;

function nameList(names: readonly string[]): string {
  if (names.length <= SHOWN_NAMES) return names.join(' · ');
  return `${names.slice(0, SHOWN_NAMES - 1).join(' · ')} · +${names.length - SHOWN_NAMES + 1} more`;
}

export function StaleCard({ names }: { readonly names: readonly string[] }) {
  const handoff = useAgentHandoff();
  const prompt = staleUpdatePrompt(names);
  const count =
    names.length === 1
      ? '1 holding needs a fresh value'
      : `${names.length} holdings need fresh values`;
  return (
    <section aria-labelledby="stale-heading">
      <div className={styles.head}>
        <h2 id="stale-heading">Needs an update</h2>
      </div>
      <Card>
        <p className={styles.count}>{count}:</p>
        <p className={styles.names}>{nameList(names)}</p>
        {handoff.status === 'pending' ? (
          <HandoffWaiting />
        ) : handoff.status === 'none' ? (
          <div className={styles.connect}>
            <p className={styles.connectNote}>Connect your agent to hand it the update.</p>
            <Link to="/agent/connect?entry=home" className={buttonClass('outlined', true)}>
              Connect to agent
            </Link>
          </div>
        ) : (
          <div className={styles.handoff}>
            <p className={styles.handoffNote}>
              Ask {handoff.connection.clientName} to update them:
            </p>
            <HandoffPrompt prompt={prompt} guide={handoff.guide} />
          </div>
        )}
      </Card>
    </section>
  );
}
