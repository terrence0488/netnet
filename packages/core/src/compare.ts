/**
 * Orders strings by UTF-16 code unit, the same in every runtime and locale (unlike
 * `localeCompare`), so outputs that are sorted by text stay deterministic.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
