import { createBrowserRouter, type RouteObject } from 'react-router';
import { Agent } from '../routes/agent/Agent';
import { Home } from '../routes/home/Home';
import { NotFound } from '../routes/not-found/NotFound';
import { RouteError } from '../routes/not-found/RouteError';
import type { RouteHandle } from './handle';
import { Shell } from './Shell';

/** The web app lives under /app on the one origin (architecture §5.2). */
export const BASENAME = '/app';

/**
 * The component gallery: every base component, in a page the E2E suite checks in both themes. It
 * is a test page, not product, so a production build leaves it out (VERCEL_ENV is `production`
 * only on a production deploy).
 */
export const GALLERY = import.meta.env.VERCEL_ENV !== 'production';

const loadGallery = async () => ({
  Component: (await import('../routes/gallery/Gallery')).Gallery,
});

const gallery: RouteObject[] = GALLERY
  ? [
      { path: 'gallery', handle: { title: 'Gallery' } satisfies RouteHandle, lazy: loadGallery },
      {
        path: 'gallery/no-chrome',
        handle: { title: 'Gallery', chrome: false } satisfies RouteHandle,
        lazy: loadGallery,
      },
    ]
  : [];

/**
 * Every screen is a child of the shell. A route without chrome says so in its handle
 * (`{chrome: false}`); its title names it in the browser's title bar.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Shell,
    ErrorBoundary: RouteError,
    HydrateFallback: () => null,
    children: [
      {
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: Home, handle: { title: 'Home' } satisfies RouteHandle },
          { path: 'agent', Component: Agent, handle: { title: 'Agent' } satisfies RouteHandle },
          ...gallery,
          { path: '*', Component: NotFound, handle: { title: 'Not found' } satisfies RouteHandle },
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes, { basename: BASENAME });
}
