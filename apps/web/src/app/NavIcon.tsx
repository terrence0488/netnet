import type { ReactNode } from 'react';

/** The nav's icons, drawn in the surrounding ink (the prototype's set). */
export type NavIconName = 'home' | 'insights' | 'agent' | 'activity' | 'account';

const PATHS: Record<NavIconName, ReactNode> = {
  home: (
    <>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  insights: (
    <>
      <path d="M4 16l5-6 4 4 7-8" />
      <path d="M4 20h16" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4" />
      <circle cx="9" cy="13" r="1.1" fill="currentColor" />
      <circle cx="15" cy="13" r="1.1" fill="currentColor" />
    </>
  ),
  activity: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20c1.2-3.7 3.9-5.6 7.2-5.6s6 1.9 7.2 5.6" />
    </>
  ),
};

/** Sized by its parent's CSS; hidden from screen readers, since the label beside it is read. */
export function NavIcon({ name }: { readonly name: NavIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
