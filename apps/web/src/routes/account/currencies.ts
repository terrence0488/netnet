import type { Countries } from '@netnet/contracts';

/**
 * The currencies General offers as the default: every currency any known country uses, alphabetical
 * by code. From content (`countries.json`), never hard-coded (N10); the prototype lists codes the
 * same way.
 */
export function currencyOptions(countries: Countries): string[] {
  return [...new Set(Object.values(countries).map((country) => country.currency))].sort();
}
