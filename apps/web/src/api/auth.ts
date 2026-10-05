/**
 * The web app's side of `/api/auth/*` (architecture §7.1): Better Auth's email and password
 * endpoints, which answer with their own error body `{code, message}`, and with §7.2's shape when
 * our rate limits or the Origin check refuse. Every failure becomes one `AuthProblem`, which the
 * screens turn into plain words (CONVENTIONS §11). Bodies here carry an email or a password, so
 * nothing about them is ever logged.
 */

const AUTH_BASE = '/api/auth';

/** What went wrong, in terms a screen can say something useful about. */
export type AuthProblem =
  /** Sign-up: the address already has an account (422). */
  | 'EXISTING_EMAIL'
  /** Sign-in: the email and password do not match an account (401). */
  | 'WRONG_PASSWORD'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'INVALID_EMAIL'
  /** Reset: the link's token has expired or was used. */
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  /** No response arrived. */
  | 'NETWORK'
  /** Anything else: our side failed. */
  | 'SERVER';

export class AuthError extends Error {
  override readonly name = 'AuthError';
  readonly problem: AuthProblem;
  readonly status: number;

  constructor(problem: AuthProblem, status: number) {
    super(`The auth request failed: ${problem} (${status}).`);
    this.problem = problem;
    this.status = status;
  }
}

export function isAuthError(error: unknown, problem?: AuthProblem): error is AuthError {
  return error instanceof AuthError && (problem === undefined || error.problem === problem);
}

const BETTER_AUTH_CODES: Readonly<Record<string, AuthProblem>> = {
  USER_ALREADY_EXISTS: 'EXISTING_EMAIL',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'EXISTING_EMAIL',
  INVALID_EMAIL_OR_PASSWORD: 'WRONG_PASSWORD',
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  PASSWORD_TOO_LONG: 'PASSWORD_TOO_LONG',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_TOKEN: 'INVALID_TOKEN',
};

/** The problem a failed response describes, from either body shape, else from its status. */
export function problemOf(status: number, body: unknown): AuthProblem {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const nested = record.error;
  const code =
    typeof nested === 'object' && nested !== null
      ? (nested as Record<string, unknown>).code
      : record.code;
  const text = typeof code === 'string' ? code : '';
  if (text === 'RATE_LIMITED' || status === 429) return 'RATE_LIMITED';
  const known = BETTER_AUTH_CODES[text];
  if (known) return known;
  const message = typeof record.message === 'string' ? record.message : '';
  if (text === 'VALIDATION_ERROR' && /email/i.test(message)) {
    return 'INVALID_EMAIL';
  }
  if (status === 422) return 'EXISTING_EMAIL';
  return 'SERVER';
}

async function post(path: string, body: Readonly<Record<string, unknown>>): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('NETWORK', 0);
  }
  if (response.ok) return;
  const parsed: unknown = await response.json().catch(() => undefined);
  throw new AuthError(problemOf(response.status, parsed), response.status);
}

/** The browser's time zone, sent with the sign-up so "today" is the person's (CONVENTIONS §5). */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Creates the account and signs the person in at once (PRD J1). */
export function signUp(email: string, password: string): Promise<void> {
  const timeZone = browserTimeZone();
  return post('/sign-up/email', { email, password, ...(timeZone ? { timeZone } : {}) });
}

export function signIn(email: string, password: string): Promise<void> {
  return post('/sign-in/email', { email, password });
}

export function signOut(): Promise<void> {
  return post('/sign-out', {});
}

/** Sends a reset link when the address has an account; the answer is the same when it has not. */
export function requestPasswordReset(email: string): Promise<void> {
  return post('/request-password-reset', { email });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return post('/reset-password', { token, newPassword });
}

export function sendVerificationEmail(email: string): Promise<void> {
  return post('/send-verification-email', { email });
}

/** The smallest check that catches a typo before the server is asked; the server decides. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** At least 8 characters, no composition rules (architecture §8); at most Better Auth's 128. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
