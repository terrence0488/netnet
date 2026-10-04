import { useState } from 'react';
import { sendVerificationEmail } from '../api/auth';
import { failureSentence } from './auth-copy';
import { authStyles } from './AuthFrame';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly sentence: string };

/**
 * Sends the verification link again (PRD J1: verification never blocks; the person can ask for
 * another). Once sent, the link gives way to a line saying so.
 */
export function ResendLink({
  email,
  label = 'Resend the link',
  sent = 'Sent again.',
}: {
  readonly email: string;
  readonly label?: string;
  readonly sent?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const send = async () => {
    if (status.kind === 'sending') return;
    setStatus({ kind: 'sending' });
    try {
      await sendVerificationEmail(email);
      setStatus({ kind: 'sent' });
    } catch (error) {
      setStatus({ kind: 'failed', sentence: failureSentence(error) });
    }
  };
  return (
    <>
      {status.kind === 'sent' ? null : (
        <button
          type="button"
          className={authStyles.link}
          aria-disabled={status.kind === 'sending' ? true : undefined}
          onClick={() => void send()}
        >
          {label}
        </button>
      )}
      <span role="status">
        {status.kind === 'sent' ? sent : status.kind === 'failed' ? ` ${status.sentence}` : ''}
      </span>
    </>
  );
}
