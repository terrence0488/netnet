import type { NavIconName } from './NavIcon';

export type NavPlace = 'tabs' | 'sidebar';

/**
 * One way into the app from its chrome: a tab on a phone, a sidebar item on a computer. The nav is
 * data, so Insights (P5) and Activity (P3) each arrive as one entry here.
 */
export interface NavEntry {
  readonly to: string;
  readonly label: string;
  readonly icon: NavIconName;
  /** Paths whose screens belong to this entry, so it stays marked while one of them is open. */
  readonly owns: readonly string[];
  /** Where it shows. Both by default; the prototype keeps Activity in the sidebar only. */
  readonly places?: readonly NavPlace[];
}

/**
 * The prototype's tabs: Home, Insights, the Agent tab, and Account, which holds Log out until
 * P3's settings join it (design-system §7).
 */
export const NAV: readonly NavEntry[] = [
  { to: '/', label: 'Home', icon: 'home', owns: ['/', '/add', '/holdings', '/archived'] },
  { to: '/insights', label: 'Insights', icon: 'insights', owns: ['/insights'] },
  { to: '/agent', label: 'Agent', icon: 'agent', owns: ['/agent', '/connect'] },
  { to: '/account', label: 'Account', icon: 'account', owns: ['/account'] },
];

export function entriesFor(place: NavPlace, nav: readonly NavEntry[] = NAV): NavEntry[] {
  return nav.filter((entry) => (entry.places ?? ['tabs', 'sidebar']).includes(place));
}

function owns(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The entry the current screen belongs to: the one owning the longest matching path. */
export function activeEntry(
  pathname: string,
  nav: readonly NavEntry[] = NAV,
): NavEntry | undefined {
  let best: { entry: NavEntry; length: number } | undefined;
  for (const entry of nav) {
    for (const path of entry.owns) {
      if (owns(path, pathname) && (!best || path.length > best.length)) {
        best = { entry, length: path.length };
      }
    }
  }
  return best?.entry;
}
