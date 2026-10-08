import type { OnboardingState } from '@netnet/contracts';

/**
 * Onboarding as data (PRD J1): one question per screen, in this order, each a value of the
 * profile's `onboardingState`, which is where a returning person resumes. After the segment comes
 * the "Let's start…" screen, then the basics walk the pack's checklist, then Home.
 */

export type OnboardingStep = Exclude<OnboardingState, 'done'>;

export interface StepInfo {
  readonly state: OnboardingStep;
  /** Its path under /onboarding. */
  readonly path: string;
  /** The browser's title for it. */
  readonly title: string;
  /** Whether it is one of the numbered questions ("1 of 2"). */
  readonly numbered: boolean;
}

export const ONBOARDING_STEPS: readonly StepInfo[] = [
  { state: 'country', path: 'country', title: 'Where you live', numbered: true },
  { state: 'segment', path: 'segment', title: 'About you', numbered: true },
  { state: 'start', path: 'start', title: 'Let’s start', numbered: false },
  { state: 'basics', path: 'basics', title: 'The basics', numbered: false },
];

export const ONBOARDING_BASE = '/onboarding';

function indexOf(state: OnboardingState): number {
  return ONBOARDING_STEPS.findIndex((step) => step.state === state);
}

/** The screen a profile's state names: its step, or Home once onboarding is done. */
export function pathOf(state: OnboardingState): string {
  if (state === 'done') return '/';
  // A state this build does not know (a newer server's step) starts at the beginning.
  const step = ONBOARDING_STEPS[indexOf(state)] ?? ONBOARDING_STEPS[0];
  return step ? `${ONBOARDING_BASE}/${step.path}` : '/';
}

/** The state to save once a step is answered: the next step's, or `done` after the last. */
export function nextState(state: OnboardingStep): OnboardingState {
  return ONBOARDING_STEPS[indexOf(state) + 1]?.state ?? 'done';
}

/** The step before this one, which Back returns to, if there is one. */
export function previousStep(state: OnboardingStep): StepInfo | undefined {
  const index = indexOf(state);
  return index > 0 ? ONBOARDING_STEPS[index - 1] : undefined;
}

/** "1 of 2" among the numbered questions, or undefined for a screen that is not one. */
export function stepLabel(state: OnboardingStep): string | undefined {
  const numbered = ONBOARDING_STEPS.filter((step) => step.numbered);
  const at = numbered.findIndex((step) => step.state === state);
  return at < 0 ? undefined : `${at + 1} of ${numbered.length}`;
}

/** Whether a person whose profile says `saved` may open `step`: any step up to where they are. */
export function reachable(step: OnboardingStep, saved: OnboardingState): boolean {
  if (saved === 'done') return false;
  const at = indexOf(saved);
  return at < 0 ? indexOf(step) === 0 : indexOf(step) <= at;
}
