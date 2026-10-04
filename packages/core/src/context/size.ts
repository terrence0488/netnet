/**
 * What keeps the context within its size (architecture §7.5): names are user text of any length,
 * so each is cut to a bound, and the document is measured as the bytes an agent receives.
 */

/** The most characters (code points) of a holding, type or tag name the context carries. */
export const MAX_NAME_LENGTH = 64;

/**
 * A name cut to `MAX_NAME_LENGTH` characters, ending with "…" when it was longer. It is cut
 * between code points, never inside one. `list_holdings` has every name in full.
 */
export function clipName(name: string): string {
  const points = Array.from(name);
  return points.length <= MAX_NAME_LENGTH
    ? name
    : `${points.slice(0, MAX_NAME_LENGTH - 1).join('')}…`;
}

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

/** The length of `text` in UTF-8 bytes; a lone surrogate counts as U+FFFD, as encoders write it. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (isHighSurrogate(unit) && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}
