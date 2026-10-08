import { Link } from 'react-router';
import { Figure, Rule, Wordmark } from '../../components';
import { buttonClass } from '../../components/Button';
import { HandoffPrompt, HandoffWaiting, useAgentHandoff } from './AgentHandoff';
import { START_PROMPT } from './prompts';
import styles from './EmptyHome.module.css';

/**
 * Home's top bar: the wordmark and the way to add. Shared by the empty and the loaded Home, so
 * the two can never drift apart.
 */
export function HomeTopBar() {
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

/**
 * The empty Home (PRD J1), whole: the $0 hero, one sentence, and the way on. The empty rule holds
 * exactly — without an agent, "Add what you have" primary with the agent below a rule; with one
 * connected, the starting prompt with "add it yourself" as the alternative. P2-T2's blank Home
 * reuses this as is: with an agent connected and nothing tracked, it is this screen.
 */
export function EmptyHome({ baseCurrency }: { readonly baseCurrency: string }) {
  return (
    <>
      <HomeTopBar />
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Net worth</h1>
        <Figure size="display" minor={0} currency={baseCurrency} total />
      </div>
      <p className={styles.lead}>Nothing here yet.</p>
      <EmptyNext />
    </>
  );
}

/** The empty Home's way on: the primary action, then the genuine second route below a rule. */
function EmptyNext() {
  const handoff = useAgentHandoff();

  if (handoff.status === 'pending') {
    return (
      <div className={styles.emptyNext}>
        <Link to="/add" className={buttonClass('primary', true)}>
          Add what you have
        </Link>
        <HandoffWaiting />
      </div>
    );
  }
  if (handoff.status === 'none') {
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
      <p className={styles.emptyHint}>
        {handoff.connection.clientName} is connected. Ask it to set things up:
      </p>
      <HandoffPrompt prompt={START_PROMPT} guide={handoff.guide} />
      <Link to="/add" className={styles.plainLink}>
        Or add it yourself ›
      </Link>
    </div>
  );
}
