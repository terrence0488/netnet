import { OTHER_GUIDE, type AgentGuide } from '@netnet/contracts';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useAgentGuides } from '../routes/agent/queries';
import { buttonClass } from './Button';
import { cx } from './cx';
import { Rule } from './Rule';
import styles from './ConnectButton.module.css';

/**
 * "Connect to agent" (PRD J5, design-system §6): an outlined button whose icon turns through the
 * listed guides' logos, two seconds each, drawn in the button's ink, and holds still under reduced
 * motion; screen readers hear only "Connect to agent". The guides come from content, never from
 * code; while they load, the button shows the generic agent icon.
 */

/** A content image (`images/…`) as the static file the app serves it as (architecture §7.1). */
export function contentImageUrl(path: string): string {
  return `/content/${path}`;
}

/** "Claude", "ChatGPT and Claude", "ChatGPT, Claude and Grok": names in a sentence. */
export function listNames(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Whether the device asks for reduced motion. False on the server. */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, []);
  const snapshot = useCallback(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** NetNet's own agent icon: the roll's first face, and "Other agent"'s (design-system §6). */
export function AgentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4" />
      <circle cx="9" cy="13" r="1.1" fill="currentColor" />
      <circle cx="15" cy="13" r="1.1" fill="currentColor" />
    </svg>
  );
}

/**
 * An agent's logo, as a silhouette in the ink around it (the files are `currentColor` marks, so
 * any official file fits both themes). "Other agent" has no logo file and uses the generic icon;
 * a logo file that fails to load shows the agent's initial in a circle (design-system §6).
 */
export function AgentLogo({ guide }: { guide: AgentGuide }) {
  const [missing, setMissing] = useState(false);
  if (guide.logo === undefined || missing) {
    if (guide.logo === undefined) {
      return (
        <span className={styles.logo} aria-hidden="true">
          <AgentIcon />
        </span>
      );
    }
    return (
      <span className={cx(styles.logo, styles.initial)} aria-hidden="true">
        {guide.name.charAt(0)}
      </span>
    );
  }
  return (
    <img
      className={styles.logo}
      src={contentImageUrl(guide.logo)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setMissing(true)}
    />
  );
}

/** How long each face of the roll shows (design-system §6, Agent roll). */
export const ROLL_MS = 2000;

/**
 * The icon slot on "Connect to agent": the generic agent icon, then each listed guide's logo in
 * turn, two seconds each, counted from when the button appears. Still under reduced motion, and
 * hidden from screen readers (design-system §6).
 */
export function AgentRoll({ guides }: { guides: readonly AgentGuide[] }) {
  const reduce = usePrefersReducedMotion();
  const faces = guides.filter((guide) => guide.logo !== undefined);
  const count = 1 + faces.length;
  const [at, setAt] = useState({ on: 0, was: -1 });
  useEffect(() => {
    if (reduce || count < 2 || typeof document === 'undefined') return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setAt(({ on }) => ({ on: (on + 1) % count, was: on }));
    }, ROLL_MS);
    return () => window.clearInterval(timer);
  }, [reduce, count]);
  return (
    <span className={styles.roll} aria-hidden="true" data-testid="agent-roll">
      {[null, ...faces].map((face, index) => (
        <i
          key={face === null ? 'generic' : face.id}
          className={cx(styles.face, index === at.on && styles.on, index === at.was && styles.was)}
        >
          {face === null ? <AgentIcon /> : <AgentLogo guide={face} />}
        </i>
      ))}
    </span>
  );
}

/** Where the connect flow starts from; `holding` joins with its own task. */
export type ConnectEntry = 'agent' | 'home' | 'onboarding';

export function ConnectButton({ entry }: { entry: ConnectEntry }) {
  const guides = useAgentGuides();
  return (
    <Link
      to={`/agent/connect?entry=${entry}`}
      className={cx(buttonClass('outlined'), styles.button)}
    >
      <AgentRoll guides={guides.data ?? []} />
      Connect to agent
    </Link>
  );
}

/**
 * The alternative route (design-system §6): below a rule, a subtitle and the outlined button.
 * How a genuine second way to start is offered without competing with the primary. The empty Home
 * (P1-T16) and the empty Agent tab share this one block, so the two can never drift apart.
 */
export function AlternativeRoute({
  entry,
  title = 'Let your AI agent do this',
}: {
  entry: ConnectEntry;
  title?: string;
}) {
  const guides = useAgentGuides();
  const named = (guides.data ?? []).filter((guide) => guide.id !== OTHER_GUIDE);
  return (
    <div className={styles.alt}>
      <Rule variant="strong" />
      <p className={styles.altTitle}>{title}</p>
      <p className={styles.altSub}>
        {named.length > 0
          ? `Works with ${listNames(named.map((guide) => guide.name))}, or any agent that supports MCP.`
          : 'Works with any agent that supports MCP.'}
      </p>
      <ConnectButton entry={entry} />
    </div>
  );
}
