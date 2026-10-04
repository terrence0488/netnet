import type { ProfileView } from '@netnet/contracts';
import type { ReactElement } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams, type Location } from 'react-router';
import { useMe } from '../api/account';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { pathOf } from '../routes/onboarding/steps';
import styles from './guards.module.css';

/**
 * Where a visitor must be, whatever address they asked for (PRD J1, the prototype's guardRoute):
 * signed out → log in; signed in with onboarding unfinished → where onboarding was left; signed in
 * and onboarded → never back to sign-up or log-in. Each guard is a layout route around the screens
 * it protects. Paths here are inside the app (the router's basename, /app, is implied).
 */

/** The screens a signed-out visitor may be sent back to after logging in. */
const LOGIN = '/login';

/**
 * A `next` address from the query, if it is one of the app's own screens: a path, never another
 * origin (`//host`, `/\host`) and never a sign-in screen, so a link cannot send anyone elsewhere.
 */
export function safeNext(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const path = value.split(/[?#]/)[0] ?? '';
  if (['/signup', '/login', '/forgot'].some((p) => path === p || path.startsWith(`${p}/`))) {
    return null;
  }
  return value;
}

/** The log-in screen, remembering the screen asked for so logging in returns there. */
export function loginPath(location: Pick<Location, 'pathname' | 'search'>): string {
  const asked = `${location.pathname}${location.search}`;
  return asked === '/' || safeNext(asked) === null
    ? LOGIN
    : `${LOGIN}?next=${encodeURIComponent(asked)}`;
}

/** Where a signed-in person goes from sign-up or log-in: onboarding until it is done, then `next`. */
export function destinationFor(me: ProfileView, next: string | null): string {
  if (me.onboardingState !== 'done') return pathOf(me.onboardingState);
  return safeNext(next) ?? '/';
}

/** While the app asks who is signed in. */
export function Waiting() {
  return (
    <div className={styles.waiting}>
      <Spinner />
    </div>
  );
}

/**
 * The person, once known: their profile, or null when signed out. Until then, a spinner, or what
 * went wrong with a way to try again (no network, say).
 */
export function useKnownMe(): { me: ProfileView | null } | { wait: ReactElement } {
  const me = useMe();
  if (me.data !== undefined) return { me: me.data };
  if (me.isError) {
    return { wait: <ErrorState error={me.error} onRetry={() => void me.refetch()} /> };
  }
  return { wait: <Waiting /> };
}

/** Signed in, whatever onboarding's state: a screen any account may open (the approval page). */
export function RequireSignedIn() {
  const location = useLocation();
  const known = useKnownMe();
  if ('wait' in known) return known.wait;
  if (known.me === null) return <Navigate to={loginPath(location)} replace />;
  return <Outlet />;
}

/** Signed in and onboarded: Home, the tabs and everything with chrome. */
export function RequireAccount() {
  const location = useLocation();
  const known = useKnownMe();
  if ('wait' in known) return known.wait;
  if (known.me === null) return <Navigate to={loginPath(location)} replace />;
  if (known.me.onboardingState !== 'done') {
    return <Navigate to={pathOf(known.me.onboardingState)} replace />;
  }
  return <Outlet />;
}

/**
 * Sign-up, log-in and forgot password. They show at once, without waiting to learn who is signed
 * in; a signed-in person is then sent where they belong, which is also how signing in or up moves
 * on once the profile is fetched.
 */
export function SignedOutOnly() {
  const me = useMe();
  const [params] = useSearchParams();
  if (me.data) return <Navigate to={destinationFor(me.data, params.get('next'))} replace />;
  return <Outlet />;
}
