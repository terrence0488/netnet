import type { FinancialContext } from '@netnet/contracts';

/**
 * The context's fixed English (architecture §7.5). It states facts and uncertainty, never what to
 * do (PRD §2.4, N2): a test scans every sentence here for advice. The answer guide is an opinion
 * about the interaction, universal and not local knowledge, so it lives in code; what a holding
 * is comes from the pack (`meaning`).
 */

/** Which figure answers which kind of question (PRD §2.4's answer-shape layer). */
export const ANSWER_GUIDE: FinancialContext['answer_guide'] = [
  {
    for: 'affordability — can I pay for X from what I have',
    use: 'totals.could_use',
    never: 'totals.net_worth',
    note: 'sell_first, locked and undecided money is excluded',
  },
  {
    for: 'progress — am I on track, how did I do',
    use: 'totals.net_worth, totals.change, holdings[].change',
  },
  { for: 'exposure and risk', use: 'exposure' },
  { for: 'debt burden', use: 'totals.owed, totals.owed_to_could_use' },
  { for: 'how current and complete the figures are', use: 'picture, holdings[].value' },
];

/** Where the holdings the context does not list are. */
export const OMITTED_HINT = 'list_holdings returns every holding';

/** A holding's name inside a note: quoted, so it reads as the user's text, not NetNet's. */
const quoted = (name: string) => `“${name}”`;

/**
 * The note templates, filled with numbers and holding names only (already cut by `clipName`).
 * Each takes how many holdings it is about and the name of the largest.
 */
export const NOTES = {
  empty: () => 'No holdings have been added yet',
  undecided: (n: number, largest: string) =>
    n === 1
      ? `Accessibility of ${quoted(largest)} is undecided: it counts in net_worth, not in could_use`
      : `Accessibility of ${n} holdings is undecided, the largest ${quoted(largest)}: they count in net_worth, not in could_use`,
  withoutValue: (n: number, largest: string) =>
    n === 1
      ? `${quoted(largest)} has no value yet, so no total includes it`
      : `${n} holdings have no value yet, so no total includes them`,
  stale: (n: number, largest: string, days: number) =>
    n === 1
      ? `The value of ${quoted(largest)} is ${days} days old, past its usual update interval`
      : `${n} values are past their usual update interval; the largest, ${quoted(largest)}, is ${days} days old`,
  converted: (currencies: number) =>
    `Values in ${currencies} other ${currencies === 1 ? 'currency' : 'currencies'} are converted to the base currency at the rate of each value’s date, not today’s`,
  partial: () => 'NetNet only knows what has been added',
} as const;

/** What the notes are about, each list largest first. */
export interface NoteFacts {
  holdings: number;
  undecided: readonly string[];
  withoutValue: readonly string[];
  stale: readonly { name: string; days: number }[];
  /** How many currencies other than the base currency the latest values are in. */
  otherCurrencies: number;
}

/**
 * `picture.notes`, most important first: what an affordability answer must be qualified by
 * (undecided, J2), then what the totals leave out, what is out of date, how amounts were
 * converted, and that the picture is only what has been added. At most five.
 */
export function pictureNotes(facts: NoteFacts): string[] {
  if (facts.holdings === 0) return [NOTES.empty()];
  const notes: string[] = [];
  const [undecided] = facts.undecided;
  if (undecided !== undefined) notes.push(NOTES.undecided(facts.undecided.length, undecided));
  const [withoutValue] = facts.withoutValue;
  if (withoutValue !== undefined) {
    notes.push(NOTES.withoutValue(facts.withoutValue.length, withoutValue));
  }
  const [stale] = facts.stale;
  if (stale !== undefined) notes.push(NOTES.stale(facts.stale.length, stale.name, stale.days));
  if (facts.otherCurrencies > 0) notes.push(NOTES.converted(facts.otherCurrencies));
  notes.push(NOTES.partial());
  return notes;
}
