import { useEffect, useRef, useState } from 'react';
import { trackClient } from '../../api/events';
import { isPushUndecided, promptHidden, recordNotNow, turnPushOn } from '../../api/push';
import { Button } from '../../components';
import styles from './PushCard.module.css';

/**
 * Home's one-time offer to turn on push (PRD J12, the design system's Nudge card): a first
 * picture, a capable browser and an undecided device get one quiet card below the Position ledger
 * — never a pop-up, never during sign-up or the basics. Not now hides it for 30 days, a second for
 * good. Its result replaces it as one line until the person leaves the screen.
 */
export function PushCard() {
  // Decided once, when the screen lands: the card neither appears nor vanishes mid-screen.
  const [eligible] = useState(() => isPushUndecided() && !promptHidden());
  const [outcome, setOutcome] = useState<'asking' | 'on' | 'denied' | 'error' | 'dismissed'>(
    'asking',
  );
  const [busy, setBusy] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (eligible && !shown.current) {
      shown.current = true;
      void trackClient('push_prompt_shown', { entry: 'home' });
    }
  }, [eligible]);

  if (!eligible || outcome === 'dismissed') return null;

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    const result = await turnPushOn();
    setBusy(false);
    if (result === 'on') {
      setOutcome('on');
      void trackClient('push_prompt_result', { entry: 'home', result: 'granted' });
    } else if (result === 'denied') {
      setOutcome('denied');
      void trackClient('push_prompt_result', { entry: 'home', result: 'denied' });
    } else {
      setOutcome('error');
    }
  };

  const notNow = () => {
    recordNotNow();
    setOutcome('dismissed');
    void trackClient('push_prompt_result', { entry: 'home', result: 'not_now' });
  };

  if (outcome === 'on') {
    return (
      <p role="status" className={styles.result} data-testid="push-card-result">
        Notifications are on for this device.
      </p>
    );
  }

  if (outcome === 'denied') {
    return (
      <p role="status" className={styles.result} data-testid="push-card-result">
        Notifications are blocked. Allow them in your browser or phone settings to turn them on.
      </p>
    );
  }

  if (outcome === 'error') {
    return (
      <p role="status" className={styles.result} data-testid="push-card-result">
        That didn’t work. Try again from Settings → Notifications.
      </p>
    );
  }

  return (
    <div className={styles.card} data-testid="push-card">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={styles.bell}
      >
        <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16z" />
        <path d="M10 21a2.2 2.2 0 0 0 4 0" />
      </svg>
      <p className={styles.ask}>
        Want a gentle nudge on this device if you haven’t looked in a while?
      </p>
      <div className={styles.actions}>
        <Button variant="outlined" aria-disabled={busy || undefined} onClick={() => void turnOn()}>
          {busy ? 'Turning on…' : 'Turn on'}
        </Button>
        <Button
          variant="quiet"
          className={styles.notNow}
          aria-disabled={busy || undefined}
          onClick={notNow}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
