import { useId, type ReactNode } from 'react';
import { isApiError } from '../api/client';
import { Button } from './Button';
import styles from './ErrorState.module.css';

export interface ErrorCopy {
  readonly title: string;
  readonly detail: string;
  /** Whether trying the same thing again can work. */
  readonly retry: boolean;
}

const SERVER: ErrorCopy = {
  title: 'Something went wrong on our side.',
  detail: 'Try again in a moment.',
  retry: true,
};

/**
 * What went wrong, in plain language, with what to do next (J5, CONVENTIONS §11). Never a code or
 * the server's own message.
 */
export function errorCopy(error: unknown): ErrorCopy {
  if (!isApiError(error)) return SERVER;
  switch (error.code) {
    case 'NETWORK':
      return {
        title: 'NetNet can’t be reached.',
        detail: 'Check your connection, then try again.',
        retry: true,
      };
    case 'RATE_LIMITED':
      return {
        title: 'That was a lot at once.',
        detail: 'Wait a minute, then try again.',
        retry: true,
      };
    case 'REAUTH_REQUIRED':
      return {
        title: 'You’ve been logged out.',
        detail: 'Log in again to carry on.',
        retry: false,
      };
    case 'EMAIL_NOT_VERIFIED':
      return {
        title: 'Your email isn’t verified yet.',
        detail: 'Open the link we sent you, then try again.',
        retry: true,
      };
    case 'NOT_FOUND':
      return {
        title: 'This isn’t here any more.',
        detail: 'It may have been deleted. Go back and pick it again.',
        retry: false,
      };
    case 'INTERNAL':
      return SERVER;
    default:
      return {
        title: 'That didn’t work.',
        detail: 'Check what you entered, then try again.',
        retry: true,
      };
  }
}

export interface ErrorStateProps {
  /** Usually an ApiError; anything else reads as a failure on our side. */
  readonly error?: unknown;
  /** Overrides the words chosen from the error. */
  readonly title?: string;
  readonly detail?: string;
  /** Shown as Try again when trying again can work. */
  readonly onRetry?: () => void;
  /** The next step instead of Try again, such as a link to log in or to Home. */
  readonly action?: ReactNode;
}

/** A sentence, what to do about it, and one action (design-system §6, Empty state). */
export function ErrorState({ error, title, detail, onRetry, action }: ErrorStateProps) {
  const copy = errorCopy(error);
  const headingId = useId();
  const next =
    action ??
    (onRetry && copy.retry ? (
      <Button variant="primary" onClick={onRetry}>
        Try again
      </Button>
    ) : null);
  return (
    <section className={styles.state} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {title ?? copy.title}
      </h2>
      <p className={styles.detail}>{detail ?? copy.detail}</p>
      {next ? <div className={styles.next}>{next}</div> : null}
    </section>
  );
}
