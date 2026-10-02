import { useMatches } from 'react-router';

/** What a route tells the shell about itself, as its `handle`. */
export interface RouteHandle {
  /** The screen's name for the browser's title bar: "Home · NetNet". */
  readonly title?: string;
  /**
   * False for routes without chrome (sign-up, log-in, onboarding, the approval page): no tabs and
   * no sidebar, and the shell becomes one narrow column (design-system §7).
   */
  readonly chrome?: boolean;
}

function isHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null;
}

/** The matched routes' handles merged, the deepest route winning. */
export function mergeHandles(handles: readonly unknown[]): RouteHandle {
  return handles.reduce<RouteHandle>(
    (merged, handle) => (isHandle(handle) ? { ...merged, ...handle } : merged),
    {},
  );
}

export function useRouteHandle(): RouteHandle {
  return mergeHandles(useMatches().map((match) => match.handle));
}

export function documentTitle(handle: RouteHandle): string {
  return handle.title ? `${handle.title} · NetNet` : 'NetNet';
}
