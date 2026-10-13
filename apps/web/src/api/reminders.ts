import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { isApiError, send } from './client';

/**
 * The comeback reminder's links in the web app (PRD J12): reporting an open, and the
 * unsubscribe. Neither needs a session — the signed token is the authority — and neither signs
 * anyone in.
 */

/** The reminder's token in the address: `/app/?r=‹token›`. */
export const REMINDER_PARAM = 'r';

/**
 * Reports the reminder's token as opened. Best effort: opened tracking must never break the
 * app, so every outcome — including no network — resolves quietly.
 */
export async function reportReminderOpened(token: string): Promise<void> {
  try {
    await send('POST', '/reminders/opened', { token });
  } catch {
    // Dropped: the person is already where the reminder sent them.
  }
}

/**
 * Turns email reminders off with the token: `off` when it worked, `invalid` when the link is
 * unknown or has expired (links last 60 days), `error` when the request itself failed.
 */
export async function unsubscribeEmailReminders(
  token: string,
): Promise<'off' | 'invalid' | 'error'> {
  try {
    await send('POST', '/reminders/unsubscribe', { token });
    return 'off';
  } catch (error) {
    return isApiError(error) && error.status === 404 ? 'invalid' : 'error';
  }
}

/** `search` without the reminder's token: what stays in the address after an open is reported. */
export function withoutReminderParam(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.delete(REMINDER_PARAM);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

/**
 * Posts the `?r=` token the app was opened with, then drops it from the address. Runs on every
 * screen (the Shell mounts it), once per token, whether or not anyone is signed in.
 */
export function useReminderOpenParam(): void {
  const [params, setParams] = useSearchParams();
  const reported = useRef<string | null>(null);
  useEffect(() => {
    const token = params.get(REMINDER_PARAM);
    if (token === null || token === '' || reported.current === token) return;
    reported.current = token;
    void reportReminderOpened(token);
    const next = new URLSearchParams(params);
    next.delete(REMINDER_PARAM);
    setParams(next, { replace: true });
  }, [params, setParams]);
}
