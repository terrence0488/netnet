import type { ProfileView, Segment } from '@netnet/contracts';
import { useOutletContext } from 'react-router';

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
}

export interface OnboardingContext {
  readonly me: ProfileView;
  readonly draft: OnboardingDraft;
  readonly updateDraft: (change: OnboardingDraft) => void;
}

export function useOnboarding(): OnboardingContext {
  return useOutletContext<OnboardingContext>();
}
