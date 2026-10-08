import { useState } from 'react';
import {
  PROVIDER_NAMES,
  enabledProviders,
  isAuthError,
  startSocialSignIn,
  type SocialProvider,
} from '../api/auth';
import { trackClient } from '../api/events';
import { failureSentence, providerUnavailable } from './auth-copy';
import { cx } from './cx';
import styles from './ProviderButtons.module.css';

/**
 * "Continue with Google" and "Continue with Apple" (architecture §8 "Providers", PRD J1): the
 * providers' official buttons, above the email on the sign-up and log-in screens. Tapping one
 * fires `signup_started {method}` on the way out (sign-up only) and leaves for the provider,
 * which sends the person back to the app (keeping `?next=`), or to this screen with `?error=`
 * when the round trip fails. Nothing renders when no provider is enabled.
 *
 * The two buttons' colours are the brands' own (Google's sign-in branding guidelines, Apple's
 * Human Interface Guidelines), not NetNet's tokens: an official button cannot be drawn from
 * another palette. Everything else about them (size, spacing, radius, type) is tokens, in the
 * module stylesheet. The text is the text token, not Roboto: one more font for two buttons
 * would cost every page load.
 */

export interface ProviderButtonsProps {
  /** `signup` fires `signup_started {method}` before leaving; `login` fires nothing. */
  readonly mode: 'signup' | 'login';
  /** This screen's path inside the app, for a failure's return (`/signup`, `/login`). */
  readonly screen: '/signup' | '/login';
  /** The address's query (`?next=…`), kept so logging in returns where it was asked to. */
  readonly search: string;
  /** Shows a whole-form problem (no network, too fast, a provider not set up). */
  readonly onProblem: (problem: string) => void;
}

/**
 * A failure's return query: where logging in was headed is kept, the provider is named, and any
 * older error is dropped (`?next=%2Fagent&provider=google`).
 */
export function errorSearch(search: string, provider: SocialProvider): string {
  const params = new URLSearchParams(search);
  params.set('provider', provider);
  params.delete('error');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** The brands' chrome, exactly as their guidelines draw it (see above). */
const BRAND: Record<
  SocialProvider,
  { backgroundColor: string; borderColor?: string; color: string }
> = {
  google: { backgroundColor: '#FFFFFF', borderColor: '#747775', color: '#1F1F1F' },
  apple: { backgroundColor: '#000000', color: '#FFFFFF' },
};

/** Google's "G", the official four-colour mark (Google's brand asset, 24px grid). */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.mark}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/** Apple's mark, a silhouette in the button's ink (the official file, 24px grid). */
export function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.mark}>
      <path
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
        fill="currentColor"
      />
    </svg>
  );
}

export function ProviderButtons({ mode, screen, search, onProblem }: ProviderButtonsProps) {
  const providers = enabledProviders();
  const [busy, setBusy] = useState(false);
  if (providers.length === 0) return null;

  const start = async (provider: SocialProvider) => {
    if (busy) return;
    setBusy(true);
    try {
      // Before leaving for the provider, so the funnel counts every start (PRD §3.5). Awaited:
      // the navigation that follows would cancel a request still in flight.
      if (mode === 'signup') await trackClient('signup_started', { method: provider });
      const origin = window.location.origin;
      const url = await startSocialSignIn(
        provider,
        `${origin}/app${search}`,
        `${origin}/app${screen}${errorSearch(search, provider)}`,
      );
      window.location.assign(url);
    } catch (error) {
      onProblem(
        isAuthError(error, 'UNAVAILABLE')
          ? providerUnavailable(PROVIDER_NAMES[provider])
          : failureSentence(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.providers}>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          style={BRAND[provider]}
          className={cx(styles.button, styles[provider])}
          aria-disabled={busy ? true : undefined}
          onClick={() => void start(provider)}
        >
          {provider === 'google' ? <GoogleMark /> : <AppleMark />}
          Continue with {PROVIDER_NAMES[provider]}
        </button>
      ))}
      <div className={styles.or} aria-hidden="true">
        <span>or</span>
      </div>
    </div>
  );
}
