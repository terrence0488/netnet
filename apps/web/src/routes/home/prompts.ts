import { PROMPT_SLOT } from '@netnet/contracts';

/**
 * What Home hands the agent (PRD J5): the starting prompt on a blank Home, the update prompt
 * naming what is stale. Both carry names at most, never an amount or a total.
 */

/** The first message to the agent from a blank Home: it carries no financial data. */
export const START_PROMPT =
  'Help me set up NetNet. Ask me what I have, one thing at a time — round numbers are fine — and add it for me.';

/** How many stale holdings the update prompt names before "and others". */
const NAMED_STALE = 5;

/** "“A”, “B” and “C”": quoted names in a sentence. */
function quoted(names: readonly string[]): string {
  const marked = names.map((name) => `“${name}”`);
  if (marked.length < 2) return marked.join('');
  return `${marked.slice(0, -1).join(', ')} and ${marked[marked.length - 1]}`;
}

/**
 * The update prompt, naming what is stale so the agent knows where to start. Names only: no
 * amounts, no totals, no counts.
 */
export function staleUpdatePrompt(names: readonly string[]): string {
  if (names.length === 0) {
    return 'Some of my NetNet values are out of date. Help me update them — round numbers are fine.';
  }
  if (names.length === 1) {
    return `My “${names[0]}” in NetNet needs a fresh value. Help me update it — round numbers are fine.`;
  }
  const shown = names.slice(0, NAMED_STALE);
  const list =
    names.length > NAMED_STALE
      ? `${shown.map((name) => `“${name}”`).join(', ')} and others`
      : quoted(shown);
  return `In NetNet, these need fresh values: ${list}. Help me update them — round numbers are fine.`;
}

/** The guide's prefill address with the URL-encoded prompt where `{prompt}` goes (§7.8). */
export function prefillHref(prefillUrl: string, prompt: string): string {
  return prefillUrl.replace(PROMPT_SLOT, encodeURIComponent(prompt));
}
