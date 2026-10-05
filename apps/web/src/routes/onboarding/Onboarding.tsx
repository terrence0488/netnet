import { useCallback, useState, type ComponentType } from 'react';
import { Navigate, Outlet, useLocation, type RouteObject } from 'react-router';
import { loginPath, useKnownMe } from '../../app/guards';
import type { RouteHandle } from '../../app/handle';
import type { OnboardingContext, OnboardingDraft } from './context';
import { useOnboarding } from './context';
import { Country } from './Country';
import { Segment } from './Segment';
import { ONBOARDING_STEPS, pathOf, reachable, type OnboardingStep } from './steps';

/**
 * Onboarding (PRD J1), after the account exists and before Home: one question per screen, without
 * chrome. Signed out → log in; onboarding done → Home. The answers in progress live here, so Back
 * and forward keep them.
 */
export function Onboarding() {
  const location = useLocation();
  const known = useKnownMe();
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const updateDraft = useCallback(
    (change: OnboardingDraft) => setDraft((now) => ({ ...now, ...change })),
    [],
  );
  if ('wait' in known) return known.wait;
  if (known.me === null) return <Navigate to={loginPath(location)} replace />;
  if (known.me.onboardingState === 'done') return <Navigate to="/" replace />;
  const context: OnboardingContext = { me: known.me, draft, updateDraft };
  return <Outlet context={context} />;
}

/** /onboarding itself, or an address under it that is no step: where the person left off. */
export function Resume() {
  const { me } = useOnboarding();
  return <Navigate to={pathOf(me.onboardingState)} replace />;
}

/** A step ahead of the saved one is not open yet: back to where the person is. */
function Step({ state, Screen }: { state: OnboardingStep; Screen: ComponentType }) {
  const { me } = useOnboarding();
  if (!reachable(state, me.onboardingState)) {
    return <Navigate to={pathOf(me.onboardingState)} replace />;
  }
  return <Screen />;
}

/** Each step's screen. A step without one does not compile. */
const SCREENS: Record<OnboardingStep, ComponentType> = {
  country: Country,
  segment: Segment,
};

/** The routes under /onboarding, one per step, in order. */
export const onboardingRoutes: RouteObject[] = [
  { index: true, Component: Resume },
  ...ONBOARDING_STEPS.map((step): RouteObject => ({
    path: step.path,
    handle: { title: step.title } satisfies RouteHandle,
    element: <Step state={step.state} Screen={SCREENS[step.state]} />,
  })),
  { path: '*', Component: Resume },
];
