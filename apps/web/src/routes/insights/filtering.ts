import type {
  HoldingExclusions,
  HoldingFilter,
  Interval,
  PeriodView,
  SavedExclusions,
  SavedFilter,
  TagMode,
} from '@netnet/contracts';

/**
 * Insights' filter and Don't Show list (PRD J11): the filter keeps types and tags; the Don't
 * Show list drops a holding, type or tag from Insights figures only. Both persist under their
 * own prefs keys, separate from Home's, and the screen says so.
 */

export const INSIGHT_INTERVAL: Record<PeriodView, Interval> = {
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
};

export const VIEW_ADJECTIVE: Record<PeriodView, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export const VIEW_NOUN: Record<PeriodView, string> = {
  monthly: 'Month',
  quarterly: 'Quarter',
  yearly: 'Year',
};

export const VIEW_PLURAL: Record<PeriodView, string> = {
  monthly: 'months',
  quarterly: 'quarters',
  yearly: 'years',
};

/** The range bar's caps per view (the prototype's): 0 is All, -1 the year so far. */
export const INSIGHT_RANGES: Record<PeriodView, readonly { label: string; value: number }[]> = {
  monthly: [
    { label: 'All', value: 0 },
    { label: 'YTD', value: -1 },
    { label: '6M', value: 6 },
    { label: '1Y', value: 12 },
    { label: '2Y', value: 24 },
    { label: '4Y', value: 48 },
  ],
  quarterly: [
    { label: 'All', value: 0 },
    { label: 'YTD', value: -1 },
    { label: '1Y', value: 4 },
    { label: '2Y', value: 8 },
    { label: '4Y', value: 16 },
    { label: '8Y', value: 32 },
  ],
  yearly: [
    { label: 'All', value: 0 },
    { label: '2Y', value: 2 },
    { label: '4Y', value: 4 },
    { label: '8Y', value: 8 },
    { label: '10Y', value: 10 },
  ],
};

/** How many periods one pager window holds, shared by the growth and distribution charts. */
export const PAGE_SIZE = 5;

/** Whether the filter keeps anything back. Empty lists restrict nothing. */
export function isInsightsFilterActive(filter: SavedFilter): boolean {
  return (filter.typeIds?.length ?? 0) > 0 || (filter.tagIds?.length ?? 0) > 0;
}

/** Whether the Don't Show list drops anything. */
export function isExclusionsActive(exclusions: SavedExclusions): boolean {
  return (
    (exclusions.holdingIds?.length ?? 0) > 0 ||
    (exclusions.typeIds?.length ?? 0) > 0 ||
    (exclusions.tagIds?.length ?? 0) > 0
  );
}

/** What the filter keeps, without the empty lists. */
export function normalizeInsightsFilter(filter: SavedFilter): SavedFilter {
  const out: SavedFilter = {};
  if (filter.typeIds?.length) out.typeIds = [...filter.typeIds];
  if (filter.tagIds?.length) {
    out.tagIds = [...filter.tagIds];
    if (filter.tagMode !== undefined) out.tagMode = filter.tagMode;
  }
  return out;
}

/** What the Don't Show list drops, without the empty lists. */
export function normalizeExclusions(exclusions: SavedExclusions): SavedExclusions {
  const out: SavedExclusions = {};
  if (exclusions.holdingIds?.length) out.holdingIds = [...exclusions.holdingIds];
  if (exclusions.typeIds?.length) out.typeIds = [...exclusions.typeIds];
  if (exclusions.tagIds?.length) out.tagIds = [...exclusions.tagIds];
  return out;
}

export interface InsightLabels {
  readonly types: ReadonlyMap<string, string>;
  readonly tags: ReadonlyMap<string, string>;
  readonly holdings: ReadonlyMap<string, string>;
}

function namesOf(ids: readonly string[], labels: ReadonlyMap<string, string>): string[] {
  return ids.map((id) => labels.get(id)).filter((label): label is string => label !== undefined);
}

/**
 * The active filter in one line, naming what it keeps ("Cash, Listed · Rainy day OR Shared").
 * Tags read with their match. What the filter names but Insights no longer knows is left out.
 */
export function describeInsightsFilter(filter: SavedFilter, labels: InsightLabels): string {
  const parts: string[] = [];
  const onlyTypes = namesOf(filter.typeIds ?? [], labels.types);
  if (onlyTypes.length > 0) parts.push(onlyTypes.join(', '));
  const onlyTags = namesOf(filter.tagIds ?? [], labels.tags);
  if (onlyTags.length > 0) {
    parts.push(onlyTags.join(filter.tagMode === 'all' ? ' AND ' : ' OR '));
  }
  return parts.join(' · ');
}

/** The Don't Show list in one line, naming every holding, type and tag it drops. */
export function describeExclusions(exclusions: SavedExclusions, labels: InsightLabels): string {
  return [
    ...namesOf(exclusions.holdingIds ?? [], labels.holdings),
    ...namesOf(exclusions.typeIds ?? [], labels.types),
    ...namesOf(exclusions.tagIds ?? [], labels.tags),
  ].join(', ');
}

/** Where one type or tag stands: shown-only, hidden from Insights, or neither. */
export type TriState = 'only' | 'hide' | 'off';

export function triState(
  filter: SavedFilter,
  exclusions: SavedExclusions,
  kind: 'type' | 'tag',
  id: string,
): TriState {
  const shown = kind === 'type' ? (filter.typeIds ?? []) : (filter.tagIds ?? []);
  const hidden = kind === 'type' ? (exclusions.typeIds ?? []) : (exclusions.tagIds ?? []);
  if (shown.includes(id)) return 'only';
  if (hidden.includes(id)) return 'hide';
  return 'off';
}

export interface InsightsDraft {
  readonly filter: SavedFilter;
  readonly exclusions: SavedExclusions;
}

/**
 * Moves one type or tag to its new state across the filter and the Don't Show list, never
 * leaving it shown-only and hidden at once.
 */
export function setTriState(
  draft: InsightsDraft,
  kind: 'type' | 'tag',
  id: string,
  next: TriState,
): InsightsDraft {
  const shownKey = kind === 'type' ? 'typeIds' : 'tagIds';
  const drop = (ids: readonly string[] | undefined) => (ids ?? []).filter((x) => x !== id);
  const filter = normalizeInsightsFilter({
    ...draft.filter,
    [shownKey]:
      next === 'only' ? [...drop(draft.filter[shownKey]), id] : drop(draft.filter[shownKey]),
  });
  const hiddenKey = shownKey;
  const exclusions = normalizeExclusions({
    ...draft.exclusions,
    [hiddenKey]:
      next === 'hide'
        ? [...drop(draft.exclusions[hiddenKey]), id]
        : drop(draft.exclusions[hiddenKey]),
  });
  return { filter, exclusions };
}

/** Toggles one holding in or out of the Don't Show list. */
export function toggleExcludedHolding(exclusions: SavedExclusions, id: string): SavedExclusions {
  const ids = exclusions.holdingIds ?? [];
  return normalizeExclusions({
    ...exclusions,
    holdingIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
  });
}

/** The show-only tags' match, defaulting to OR. */
export function tagMatch(filter: SavedFilter): TagMode {
  return filter.tagMode ?? 'any';
}

/** The saved Don't Show list as core reads it: only the keys that are set. */
export function asHoldingExclusions(exclusions: SavedExclusions): HoldingExclusions {
  return {
    ...(exclusions.holdingIds !== undefined ? { holdingIds: exclusions.holdingIds } : {}),
    ...(exclusions.typeIds !== undefined ? { typeIds: exclusions.typeIds } : {}),
    ...(exclusions.tagIds !== undefined ? { tagIds: exclusions.tagIds } : {}),
  };
}

/**
 * The counted set as one core filter: the filter's show-only keys plus the Don't Show list as
 * hides. A Don't Show entry drops exactly what the same hide key drops — a listed tag drops a
 * holding with any of them — so figures over this set match `periods` with the exclusions. The
 * Insights sheet writes no hide keys of its own, so the merge never meets another writer.
 */
export function countedFilter(filter: SavedFilter, exclusions: SavedExclusions): HoldingFilter {
  const out: HoldingFilter = {};
  if (filter.typeIds !== undefined) out.typeIds = filter.typeIds;
  if (filter.tagIds !== undefined) out.tagIds = filter.tagIds;
  if (filter.tagMode !== undefined) out.tagMode = filter.tagMode;
  const hideHoldingIds = [...(filter.hideHoldingIds ?? []), ...(exclusions.holdingIds ?? [])];
  const hideTypeIds = [...(filter.hideTypeIds ?? []), ...(exclusions.typeIds ?? [])];
  const hideTagIds = [...(filter.hideTagIds ?? []), ...(exclusions.tagIds ?? [])];
  if (hideHoldingIds.length > 0) out.hideHoldingIds = hideHoldingIds;
  if (hideTypeIds.length > 0) out.hideTypeIds = hideTypeIds;
  if (hideTagIds.length > 0) out.hideTagIds = hideTagIds;
  if (filter.hideTagMode !== undefined) out.hideTagMode = filter.hideTagMode;
  return out;
}
