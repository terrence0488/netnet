/**
 * An agent's registered name is untrusted third-party text (architecture §8): it never goes into an
 * event or a log, and wherever it is shown it is cleaned and cut here first, then escaped by
 * whatever renders it (the email's layout, React).
 */

/** The approval page and the Agent tab show at most this much of a name. */
export const SHOWN_NAME_LENGTH = 120;

/** The security email names the agent in at most 40 characters (§7.10). */
export const EMAIL_NAME_LENGTH = 40;

/** Control and format characters (bidi overrides among them) and line breaks: never shown. */
const UNSHOWN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * `raw` on one line, without control or format characters, at most `max` characters (an ellipsis
 * ends a name that was cut). Empty when the agent gave no name.
 */
export function cleanAgentName(raw: string | null | undefined, max: number): string {
  const text = (raw ?? '').replace(UNSHOWN, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}
