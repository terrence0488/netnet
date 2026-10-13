import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { unsubscribeEmailReminders } from '../../api/reminders';
import { Waiting } from '../../app/guards';
import { AuthFrame, authStyles, buttonClass } from '../../components';

/**
 * Where the reminder email's footer link lands (`?token=…`): it posts the token once it loads,
 * so fetching the link — a mail scanner, say — changes nothing, and only opening it in a browser
 * turns email reminders off. Signed in or not. Push reminders are untouched: they are switched
 * per device in Settings → Notifications.
 */
export function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [outcome, setOutcome] = useState<'posting' | 'off' | 'invalid' | 'error'>(
    token === '' ? 'invalid' : 'posting',
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token === '') return;
    let cancelled = false;
    void unsubscribeEmailReminders(token).then((result) => {
      if (!cancelled) setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const carryOn = (
    <div className={authStyles.actions}>
      <Link to="/" className={buttonClass('primary', true)}>
        Continue
      </Link>
    </div>
  );

  if (outcome === 'posting') {
    return (
      <AuthFrame title="Turning email reminders off">
        <Waiting />
      </AuthFrame>
    );
  }

  if (outcome === 'off') {
    return (
      <AuthFrame title="Email reminders are off">
        <p className={authStyles.body}>
          You won’t get reminder emails anymore. Push reminders on your devices are unchanged.
        </p>
        {carryOn}
      </AuthFrame>
    );
  }

  if (outcome === 'invalid') {
    return (
      <AuthFrame title="That link didn’t work">
        <p className={authStyles.body}>
          It may have expired: links last 60 days. Email reminders may still be on — open NetNet’s
          Settings to check.
        </p>
        {carryOn}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Something went wrong">
      <p className={authStyles.body}>The request failed. Check your connection and try again.</p>
      <div className={authStyles.actions}>
        <button
          type="button"
          className={buttonClass('primary', true)}
          onClick={() => {
            setOutcome('posting');
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
        <Link to="/" className={buttonClass('outlined', true)}>
          Continue
        </Link>
      </div>
    </AuthFrame>
  );
}
