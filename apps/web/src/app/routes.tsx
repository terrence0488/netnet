import { createBrowserRouter, type RouteObject } from 'react-router';
import { Account } from '../routes/account/Account';
import { General } from '../routes/account/General';
import { Add } from '../routes/add/Add';
import { Edit } from '../routes/add/Edit';
import { Agent } from '../routes/agent/Agent';
import { Archived } from '../routes/archived/Archived';
import { Approve } from '../routes/connect/Approve';
import { Connect } from '../routes/connect/Connect';
import { Forgot } from '../routes/forgot/Forgot';
import { Holding } from '../routes/holding/Holding';
import { Home } from '../routes/home/Home';
import { LogIn } from '../routes/login/LogIn';
import { NotFound } from '../routes/not-found/NotFound';
import { RouteError } from '../routes/not-found/RouteError';
import { Onboarding, onboardingRoutes } from '../routes/onboarding/Onboarding';
import { Unsubscribe } from '../routes/reminders/Unsubscribe';
import { Reset } from '../routes/reset/Reset';
import { SetPassword } from '../routes/signup/SetPassword';
import { SignUp } from '../routes/signup/SignUp';
import { Taxonomy } from '../routes/taxonomy/Taxonomy';
import { Verify } from '../routes/verify/Verify';
import { BASENAME } from './basename';
import { RequireAccount, RequireSignedIn, SignedOutOnly } from './guards';
import type { RouteHandle } from './handle';
import { Shell } from './Shell';

export { BASENAME };

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

const bare = (title: string): RouteHandle => ({ title, chrome: false });

/**
 * Every screen is a child of the shell. A route without chrome says so in its handle
 * (`{chrome: false}`); its title names it in the browser's title bar. The guards (guards.tsx) are
 * layout routes: sign-up and log-in for the signed out, onboarding until it is done, and the
 * screens with chrome for a signed-in, onboarded person. The reset, verify and unsubscribe
 * links' pages open in either state.
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
          {
            Component: SignedOutOnly,
            children: [
              { path: 'signup', Component: SignUp, handle: bare('Create your account') },
              { path: 'signup/password', Component: SetPassword, handle: bare('Set a password') },
              { path: 'login', Component: LogIn, handle: bare('Log in') },
              { path: 'forgot', Component: Forgot, handle: bare('Reset your password') },
            ],
          },
          { path: 'reset', Component: Reset, handle: bare('New password') },
          { path: 'verify', Component: Verify, handle: bare('Verify your email') },
          {
            path: 'reminders/unsubscribe',
            Component: Unsubscribe,
            handle: bare('Email reminders'),
          },
          {
            path: 'onboarding',
            Component: Onboarding,
            handle: bare('Welcome'),
            children: onboardingRoutes,
          },
          {
            Component: RequireSignedIn,
            children: [
              {
                path: 'connect/approve',
                Component: Approve,
                handle: bare('Approve the connection'),
              },
              // The connect flow opens mid-onboarding too (entry=onboarding, from the start
              // screen), so it asks only for a signed-in person, like the approval page.
              {
                path: 'agent/connect',
                Component: Connect,
                handle: { title: 'Connect your agent', chrome: false } satisfies RouteHandle,
              },
              {
                path: 'agent/connect/:client',
                Component: Connect,
                handle: { title: 'Connect your agent', chrome: false } satisfies RouteHandle,
              },
            ],
          },
          {
            Component: RequireAccount,
            children: [
              { index: true, Component: Home, handle: { title: 'Home' } satisfies RouteHandle },
              { path: 'add', Component: Add, handle: { title: 'Add' } satisfies RouteHandle },
              {
                path: 'holdings/:id',
                Component: Holding,
                handle: { title: 'Holding' } satisfies RouteHandle,
              },
              {
                path: 'holdings/:id/edit',
                Component: Edit,
                handle: { title: 'Edit' } satisfies RouteHandle,
              },
              {
                path: 'archived',
                Component: Archived,
                handle: { title: 'Archived' } satisfies RouteHandle,
              },
              { path: 'agent', Component: Agent, handle: { title: 'Agent' } satisfies RouteHandle },
              {
                path: 'account',
                Component: Account,
                handle: { title: 'Account' } satisfies RouteHandle,
              },
              {
                path: 'account/general',
                Component: General,
                handle: { title: 'General' } satisfies RouteHandle,
              },
              {
                path: 'account/taxonomy',
                Component: Taxonomy,
                handle: { title: 'Types and tags' } satisfies RouteHandle,
              },
              {
                path: '*',
                Component: NotFound,
                handle: { title: 'Not found' } satisfies RouteHandle,
              },
            ],
          },
          ...gallery,
        ],
      },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes, { basename: BASENAME });
}
