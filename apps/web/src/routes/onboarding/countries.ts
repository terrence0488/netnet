import type { Countries } from '@netnet/contracts';

/**
 * The countries "Where do you live?" lists (PRD §2.3 rule 2, J2): every key of `countries.json`,
 * named in the reader's own language and sorted the way that language sorts, with none pinned to
 * the top. A list that opens with one country tells everyone else the product is not for them.
 */

export interface CountryOption {
  readonly code: string;
  readonly name: string;
  /** The currency totals default to there. */
  readonly currency: string;
}

/** The reader's languages, most preferred first, as the browser reports them. */
export function readerLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en'];
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return languages.filter(Boolean);
}

function displayNames(languages: readonly string[]): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([...languages, 'en'], { type: 'region', fallback: 'code' });
  } catch {
    return null;
  }
}

function collator(languages: readonly string[]): Intl.Collator {
  try {
    return new Intl.Collator([...languages, 'en']);
  } catch {
    return new Intl.Collator('en');
  }
}

/** Every country, alphabetical in the reader's language. */
export function countryOptions(
  countries: Countries,
  languages: readonly string[],
): CountryOption[] {
  const names = displayNames(languages);
  const order = collator(languages);
  return Object.entries(countries)
    .map(([code, country]) => ({
      code,
      name: names?.of(code) ?? code,
      currency: country.currency,
    }))
    .sort((a, b) => order.compare(a.name, b.name) || a.code.localeCompare(b.code));
}

/**
 * The country the browser's own language names (`en-SG` → SG), for when our server's lookup has
 * nothing (PRD §2.3 rule 2: IP first, then locale). Only a region the reader's language states
 * counts, never one guessed from the language alone.
 */
export function localeCountry(languages: readonly string[], known: Countries): string | null {
  for (const language of languages) {
    try {
      const region = new Intl.Locale(language).region;
      if (region && Object.hasOwn(known, region)) return region;
    } catch {
      // Not a language tag: try the next one.
    }
  }
  return null;
}
