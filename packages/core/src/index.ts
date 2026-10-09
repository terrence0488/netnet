/**
 * Pure domain logic and chart geometry (CONVENTIONS §3): no I/O, no clock, no randomness.
 * `today` and ids are always passed in. Every figure the product shows or tells an agent comes
 * from here (CONVENTIONS §5).
 */

export { accessBucket, accessRule, resolveAccess } from './access';
export { baselineChange } from './baseline';
export { allocation, bars, chart, linePath, nearestPoint, scales, stacked, ticks } from './chart';
export type {
  AllocationSegment,
  AllocationSlice,
  BarCell,
  BarLayout,
  ChartScales,
  LinePaths,
  ScalesOptions,
  StackedColumn,
  StackedLayout,
  StackedSegment,
  StackedValue,
} from './chart';
export { DEFAULT_CONTEXT_BASELINE, compileContext } from './context/compile-context';
export { addDays, addMonths, daysBetween, isCalendarDate, trendRangeStart } from './dates';
export {
  DUPLICATE_SIMILARITY,
  MAX_CANDIDATES,
  likelyDuplicates,
  nameSimilarity,
  normaliseName,
} from './duplicates';
export { filterHoldings } from './filter';
export { MAX_MINOR, convert, deltaMinor, fromMinor, minorRate, toMinor } from './money';
export { chainValue, packChain, typeLabel } from './pack-chain';
export { compareValues, latestValues, position } from './position';
export { series } from './series';
export { staleness } from './staleness';

/** Marks a branch the type system has proven unreachable, for exhaustive switches. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
