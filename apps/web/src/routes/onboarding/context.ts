import type { ProfileView, Segment } from '@netnet/contracts';
import { useOutletContext } from 'react-router';
import type { BasicsAnswers } from './basics';

/**
 * Answers given in onboarding but not yet saved, kept while the person moves between its screens,
 * so Back shows an earlier answer and moving on again keeps it (PRD J1).
 */
export interface OnboardingDraft {
  /** The country picked; null once "Somewhere else" clears it; absent until touched. */
  readonly country?: string | null;
  /** Whether "Somewhere else" is chosen, which shows the full list. */
  readonly elsewhere?: boolean;
  /** The segment picked; null when unpicked again; absent until touched. */
  readonly segment?: Exclude<Segment, 'unknown'> | null;
  /** The basics' answers by checklist id; absent until the basics seed them from what is saved. */
  readonly basics?: BasicsAnswers;
}

export interface OnboardingContext {
  readonly me: ProfileView;
  readonly draft: OnboardingDraft;
  readonly updateDraft: (change: OnboardingDraft) => void;
}

export function useOnboarding(): OnboardingContext {
  return useOutletContext<OnboardingContext>();
}
