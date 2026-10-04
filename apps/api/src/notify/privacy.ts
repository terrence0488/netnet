import { CURRENCY_CODES } from '@netnet/contracts';

/**
 * The privacy check every rendered message must pass (architecture §7.10, CONVENTIONS §6, §9):
 * no digits with a currency, and none of the person's own words. Lock screens and inboxes are
 * public. The template test runs it over every kind; push payloads (P3) use it the same way.
 */

const SYMBOLS = '$€£¥₹₩₱฿₫₪₺₦₴₸₭₮₨৳';
const CODES = CURRENCY_CODES.join('|');
/** Currency markers written before or after a figure: symbols, ISO codes and local prefixes. */
const MARKER = String.raw`(?:[${SYMBOLS}]|\b(?:${CODES}|RM|Rp|S\$|HK\$|A\$|NZ\$|US\$)(?![A-Za-z]))`;
const FIGURE = String.raw`\d(?:[\d.,'\s]*\d)?`;
const WORDS = String.raw`(?:dollars?|euros?|pounds?|yen|yuan|rupees?|ringgit|baht|pesos?|dong|won|rupiah|francs?)\b`;

/** Codes are matched in capitals only: "all 3" is English, "ALL 3" is Albanian lek. */
const MONEY = [
  new RegExp(String.raw`${MARKER}\s?${FIGURE}|${FIGURE}\s?${MARKER}|${FIGURE}\s?[kKmM]\b`, 'u'),
  new RegExp(String.raw`${FIGURE}\s?${WORDS}`, 'iu'),
];

/** The text a reader sees: tags and attribute values (styles, link targets) are not words. */
function visibleText(html: string): string {
  return html
    .replace(/<(style|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
}

/** Removes links: a token in a URL is not a figure. */
function withoutLinks(text: string): string {
  return text.replace(/https?:\/\/\S+/g, ' ');
}

export interface Rendered {
  [part: string]: string | Record<string, string>;
}

/**
 * Every problem with `rendered` (an email's `{subject, html, text, headers}`, or a push's `{title,
 * body, url}`): a figure with a currency, or any of `forbidden` (the person's holding, type and
 * tag names, their email address), compared without case. An empty list means it passes.
 */
export function privacyProblems(rendered: Rendered, forbidden: readonly string[]): string[] {
  const problems: string[] = [];
  for (const [part, value] of Object.entries(rendered)) {
    const raw = typeof value === 'string' ? value : Object.values(value).join('\n');
    const text = withoutLinks(part === 'html' ? visibleText(raw) : raw);
    const money = MONEY.map((pattern) => pattern.exec(text)).find((match) => match !== null);
    if (money) problems.push(`${part}: a figure with a currency, "${money[0].trim()}"`);
    for (const word of forbidden) {
      if (word !== '' && raw.toLowerCase().includes(word.toLowerCase())) {
        problems.push(`${part}: contains "${word}"`);
      }
    }
  }
  return problems;
}
