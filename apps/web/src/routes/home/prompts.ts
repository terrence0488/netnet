import { PROMPT_SLOT } from '@netnet/contracts';

/**
 * What Home hands the agent (PRD J5, J9): the starting prompt on a blank Home, the update prompt
 * when holdings are out of date. Neither carries data: the agent finds what it needs itself,
 * through the MCP layer.
 */

/** The first message to the agent from a blank Home: it carries no financial data. */
export const START_PROMPT =
  'Help me set up NetNet. Ask me what I have, one thing at a time — round numbers are fine — and add it for me.';

/** Asked from Home when holdings are out of date: the agent finds what is stale itself. */
export const REFRESH_PROMPT =
  'Some of my NetNet holdings are out of date. Find them and help me update them.';

/** The guide's prefill address with the URL-encoded prompt where `{prompt}` goes (§7.8). */
export function prefillHref(prefillUrl: string, prompt: string): string {
  return prefillUrl.replace(PROMPT_SLOT, encodeURIComponent(prompt));
}
