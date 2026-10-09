import { Link } from 'react-router';
import { AlternativeRoute, Figure, Wordmark } from '../../components';
import { cx } from '../../components/cx';
import { buttonClass } from '../../components/Button';
import { HandoffPrompt, HandoffWaiting, useAgentHandoff } from './AgentHandoff';
import { START_PROMPT } from './prompts';
import styles from './EmptyHome.module.css';

/**
 * Home's top bar: the wordmark, the filter on the loaded Home only, and the way to add. One
 * component for the empty and the loaded Home, so the two can never drift apart.
 */
export function HomeTopBar({
  onFilter,
  filterActive = false,
}: {
  readonly onFilter?: () => void;
  readonly filterActive?: boolean;
}) {
  return (
    <div className={styles.topbar}>
      <Wordmark />
      <span className={styles.spacer} />
      {onFilter ? (
        <button
          type="button"
          className={cx(styles.iconButton, filterActive && styles.active)}
          aria-label="Filter Home"
          onClick={onFilter}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.filterIcon}
          >
            <path d="M3 5h18l-7 8v6l-4 2v-8z" />
          </svg>
        </button>
      ) : null}
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
export function EmptyHome({
  baseCurrency,
  archivedCount = 0,
}: {
  readonly baseCurrency: string;
  readonly archivedCount?: number;
}) {
  return (
    <>
      <HomeTopBar />
      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>Net worth</h1>
        <Figure size="display" minor={0} currency={baseCurrency} total />
      </div>
      <p className={styles.lead}>Nothing here yet.</p>
      <EmptyNext />
      {archivedCount > 0 ? (
        <Link to="/archived" className={styles.plainLink}>
          {archivedCount} archived ›
        </Link>
      ) : null}
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
        <AlternativeRoute entry="home" />
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
