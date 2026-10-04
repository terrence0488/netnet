import type { RenderedEmail } from '../channel';
import type { MessageOf } from '../message';
import { renderLayout } from './layout';
import type { RenderContext } from './render-context';

/**
 * The account's two emails: verifying the address after sign-up, and resetting the password. Both
 * are email only and ignore the Reminders switches (architecture §7.10). The links go to Better
 * Auth's endpoints, which redirect to the web app's pages below.
 */

/** The web app's page the verification link lands on: verified, or `?error=…` if it is not. */
export const EMAIL_VERIFIED_PAGE = '/app/verify';

/** The web app's page that asks for the new password: `?token=…`, or `?error=INVALID_TOKEN`. */
export const RESET_PASSWORD_PAGE = '/app/reset';

/** Better Auth's tokens: a JWT for verification, a random id for a reset. Nothing else passes. */
const TOKEN = /^[A-Za-z0-9._~-]{16,2048}$/;

function checkedToken(token: string): string {
  if (!TOKEN.test(token)) throw new Error('A message token is malformed.');
  return token;
}

export function verifyEmail(
  msg: MessageOf<'account.verify_email'>,
  { origin }: RenderContext,
): RenderedEmail {
  const url =
    `${origin}/api/auth/verify-email?token=${checkedToken(msg.token)}` +
    `&callbackURL=${encodeURIComponent(EMAIL_VERIFIED_PAGE)}`;
  const line = 'Verify your email for NetNet';
  return {
    subject: line,
    ...renderLayout({
      line,
      detail: 'Then you can connect your AI agent. The link lasts a day.',
      button: { label: 'Verify email', url },
      footer:
        'You’re getting this because this address was used to sign up for NetNet. ' +
        'If that wasn’t you, ignore it and nothing happens.',
    }),
    headers: {},
  };
}

export function resetPassword(
  msg: MessageOf<'account.reset_password'>,
  { origin }: RenderContext,
): RenderedEmail {
  const url =
    `${origin}/api/auth/reset-password/${checkedToken(msg.token)}` +
    `?callbackURL=${encodeURIComponent(RESET_PASSWORD_PAGE)}`;
  const line = 'Reset your NetNet password';
  return {
    subject: line,
    ...renderLayout({
      line,
      detail: 'The link works once, for an hour.',
      button: { label: 'Choose a new password', url },
      footer:
        'You’re getting this because someone asked to reset the password for this address. ' +
        'If it wasn’t you, ignore it and your password stays as it is.',
    }),
    headers: {},
  };
}
