/**
 * Pure domain logic and chart geometry (CONVENTIONS §3): no I/O, no clock, no randomness.
 * `today` and ids are always passed in.
 */

/** Marks a branch the type system has proven unreachable, for exhaustive switches. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
