import type { ProfileView } from '@netnet/contracts';
import { useEffect, useLayoutEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useMe, useTimeZoneSync } from '../api/account';
import { startSessionTracker } from '../api/events';
import { usePushSessionSync } from '../api/push';
import { useReminderOpenParam } from '../api/reminders';
import { ToastViewport } from '../components/Toast';
import { Wordmark } from '../components/Wordmark';
import { cx } from '../components/cx';
import { documentTitle, useRouteHandle } from './handle';
import { activeEntry, entriesFor, type NavEntry, type NavPlace } from './nav';
import { NavIcon } from './NavIcon';
import styles from './Shell.module.css';

function NavLinks({ place, active }: { place: NavPlace; active: NavEntry | undefined }) {
  return entriesFor(place).map((entry) => (
    <Link
      key={entry.to}
      to={entry.to}
      className={place === 'tabs' ? styles.tab : styles.navItem}
      aria-current={entry === active ? 'page' : undefined}
    >
      <NavIcon name={entry.icon} />
      {entry.label}
    </Link>
  ));
}

/**
 * What runs while someone is signed in, whichever screen they are on: the session tracker
 * (`session_started` after 30 minutes idle, architecture §7.7), the browser's time zone kept on
 * the profile, and the push check-in on a device with push on.
 */
function SignedIn({ me }: { me: ProfileView }) {
  useEffect(() => startSessionTracker(), []);
  useTimeZoneSync(me);
  usePushSessionSync();
  return null;
}

/**
 * The app's frame (design-system §7): bottom tabs on a phone, a sidebar from 900px, and one
 * content column whose width depends on the viewport alone. Routes without chrome get one narrow
 * column and neither nav.
 */
export function Shell() {
  const handle = useRouteHandle();
  const chrome = handle.chrome !== false;
  const { pathname } = useLocation();
  const active = activeEntry(pathname);
  const title = documentTitle(handle);
  const me = useMe().data;

  // Only navigation moves the page (design-system §7): a new screen starts at the top, while
  // anything that updates the screen in place (a range, a sheet, a save) leaves it where it was.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  // The comeback reminder's `?r=` token, posted and dropped on every screen (PRD J12).
  useReminderOpenParam();

  return (
    <div className={cx(styles.shell, !chrome && styles.bare)} data-chrome={chrome}>
      {chrome ? (
        <header className={styles.sidebar}>
          <div className={styles.brand}>
            <Wordmark />
          </div>
          <nav aria-label="Main">
            <NavLinks place="sidebar" active={active} />
          </nav>
        </header>
      ) : null}
      <main className={styles.main}>
        <Outlet />
      </main>
      {chrome ? (
        <nav className={styles.tabbar} aria-label="Tabs">
          <div className={styles.tabs}>
            <NavLinks place="tabs" active={active} />
          </div>
        </nav>
      ) : null}
      <ToastViewport chrome={chrome} />
      {me ? <SignedIn me={me} /> : null}
    </div>
  );
}
