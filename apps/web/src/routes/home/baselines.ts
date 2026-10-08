import type { Baseline } from '@netnet/contracts';

/** PRD J4's six baselines, in the contract's order, with the labels Home shows. */
export const BASELINE_OPTIONS: readonly { readonly value: Baseline; readonly label: string }[] = [
  { value: 'initial', label: 'Initial value' },
  { value: 'last_update', label: 'Last update' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'year_start', label: 'Jan 1' },
  { value: 'last_year', label: 'Last year' },
];

/** "Last month": the label for the baseline in force. */
export function baselineLabel(baseline: Baseline): string {
  return BASELINE_OPTIONS.find((option) => option.value === baseline)?.label ?? baseline;
}
