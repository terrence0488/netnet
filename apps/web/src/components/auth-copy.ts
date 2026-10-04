import { isApiError } from '../api/client';
import { isAuthError, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../api/auth';

/**
 * What the account screens say when something fails: plain words and what to do next, never a code
 * or the server's message (CONVENTIONS §11). Each screen words its own expected answers (a wrong
 * password, an address already registered); this covers what any of them can meet.
 */

export const COPY = {
  network: 'NetNet can’t be reached. Check your connection, then try again.',
  rateLimited: 'That was a lot at once. Wait a minute, then try again.',
  server: 'Something went wrong on our side. Try again in a moment.',
  emailMissing: 'Enter an email address.',
  passwordShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  passwordLong: `Use at most ${MAX_PASSWORD_LENGTH} characters.`,
  passwordHint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
} as const;

/** The sentence for a failure no screen words for itself: no network, too fast, our fault. */
export function failureSentence(error: unknown): string {
  if (isAuthError(error, 'NETWORK') || isApiError(error, 'NETWORK')) return COPY.network;
  if (isAuthError(error, 'RATE_LIMITED') || isApiError(error, 'RATE_LIMITED')) {
    return COPY.rateLimited;
  }
  if (isAuthError(error, 'PASSWORD_TOO_SHORT')) return COPY.passwordShort;
  if (isAuthError(error, 'PASSWORD_TOO_LONG')) return COPY.passwordLong;
  if (isAuthError(error, 'INVALID_EMAIL')) return COPY.emailMissing;
  return COPY.server;
}

/** A password's problem before it is sent, if it has one. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) return COPY.passwordShort;
  if (password.length > MAX_PASSWORD_LENGTH) return COPY.passwordLong;
  return undefined;
}
