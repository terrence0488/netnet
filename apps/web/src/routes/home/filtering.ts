import type { HoldingFilter, SavedFilter } from '@netnet/contracts';

/**
 * Home's filter (PRD J4): shown-only and Don't Show for types and tags, over everything on Home.
 * A type or tag is shown-only or hidden, never both; what is hidden is always named on screen.
 */

/** Whether the filter changes anything at all. Empty lists restrict nothing. */
export function isFilterActive(filter: SavedFilter): boolean {
  return (
    (filter.show ?? 'all') !== 'all' ||
    (filter.typeIds?.length ?? 0) > 0 ||
    (filter.tagIds?.length ?? 0) > 0 ||
    (filter.hideTypeIds?.length ?? 0) > 0 ||
    (filter.hideTagIds?.length ?? 0) > 0 ||
    (filter.hideHoldingIds?.length ?? 0) > 0 ||
    (filter.includeArchived ?? false)
  );
}

/** What the filter keeps, without the empty lists and the default `show`. */
export function normalizeFilter(filter: SavedFilter): SavedFilter {
  const out: SavedFilter = {};
  if (filter.show !== undefined && filter.show !== 'all') out.show = filter.show;
  if (filter.typeIds?.length) out.typeIds = [...filter.typeIds];
  if (filter.tagIds?.length) {
    out.tagIds = [...filter.tagIds];
    if (filter.tagMode !== undefined) out.tagMode = filter.tagMode;
  }
  if (filter.hideTypeIds?.length) out.hideTypeIds = [...filter.hideTypeIds];
  if (filter.hideTagIds?.length) {
    out.hideTagIds = [...filter.hideTagIds];
    if (filter.hideTagMode !== undefined) out.hideTagMode = filter.hideTagMode;
  }
  if (filter.hideHoldingIds?.length) out.hideHoldingIds = [...filter.hideHoldingIds];
  if (filter.includeArchived === true) out.includeArchived = true;
  return out;
}

/** The saved filter as core reads it: only the keys that are set. */
export function asHoldingFilter(filter: SavedFilter): HoldingFilter {
  const out: HoldingFilter = {};
  if (filter.show !== undefined) out.show = filter.show;
  if (filter.typeIds !== undefined) out.typeIds = filter.typeIds;
  if (filter.tagIds !== undefined) out.tagIds = filter.tagIds;
  if (filter.tagMode !== undefined) out.tagMode = filter.tagMode;
  if (filter.hideTypeIds !== undefined) out.hideTypeIds = filter.hideTypeIds;
  if (filter.hideTagIds !== undefined) out.hideTagIds = filter.hideTagIds;
  if (filter.hideTagMode !== undefined) out.hideTagMode = filter.hideTagMode;
  if (filter.hideHoldingIds !== undefined) out.hideHoldingIds = filter.hideHoldingIds;
  if (filter.includeArchived !== undefined) out.includeArchived = filter.includeArchived;
  return out;
}

/** Where one type or tag stands: shown-only, hidden, or neither. */
export type TriState = 'only' | 'hide' | 'off';

export function triState(filter: SavedFilter, kind: 'type' | 'tag', id: string): TriState {
  const shown = kind === 'type' ? (filter.typeIds ?? []) : (filter.tagIds ?? []);
  const hidden = kind === 'type' ? (filter.hideTypeIds ?? []) : (filter.hideTagIds ?? []);
  if (shown.includes(id)) return 'only';
  if (hidden.includes(id)) return 'hide';
  return 'off';
}

/** Moves one type or tag to its new state, never leaving it shown-only and hidden at once. */
export function setTriState(
  filter: SavedFilter,
  kind: 'type' | 'tag',
  id: string,
  next: TriState,
): SavedFilter {
  const shownKey = kind === 'type' ? 'typeIds' : 'tagIds';
  const hiddenKey = kind === 'type' ? 'hideTypeIds' : 'hideTagIds';
  const drop = (ids: readonly string[] | undefined) => (ids ?? []).filter((x) => x !== id);
  return normalizeFilter({
    ...filter,
    [shownKey]: next === 'only' ? [...drop(filter[shownKey]), id] : drop(filter[shownKey]),
    [hiddenKey]: next === 'hide' ? [...drop(filter[hiddenKey]), id] : drop(filter[hiddenKey]),
  });
}

function namesOf(ids: readonly string[], labels: ReadonlyMap<string, string>): string[] {
  return ids.map((id) => labels.get(id)).filter((label): label is string => label !== undefined);
}

export interface FilterLabels {
  readonly types: ReadonlyMap<string, string>;
  readonly tags: ReadonlyMap<string, string>;
}

/**
 * The active filter in one line, naming what is hidden ("Assets only · hiding Property,
 * Groceries"). Tags read with their match ("Rainy day OR Shared"). What the filter names but
 * Home no longer knows (a type since deleted) is left out.
 */
export function describeHomeFilter(filter: SavedFilter, labels: FilterLabels): string {
  const parts: string[] = [];
  if (filter.show === 'assets') parts.push('Assets only');
  if (filter.show === 'liabilities') parts.push('Liabilities only');
  const onlyTypes = namesOf(filter.typeIds ?? [], labels.types);
  if (onlyTypes.length > 0) parts.push(onlyTypes.join(', '));
  const onlyTags = namesOf(filter.tagIds ?? [], labels.tags);
  if (onlyTags.length > 0) {
    parts.push(onlyTags.join(filter.tagMode === 'all' ? ' AND ' : ' OR '));
  }
  const hiddenTypes = namesOf(filter.hideTypeIds ?? [], labels.types);
  if (hiddenTypes.length > 0) parts.push(`hiding ${hiddenTypes.join(', ')}`);
  const hiddenTags = namesOf(filter.hideTagIds ?? [], labels.tags);
  if (hiddenTags.length > 0) {
    parts.push(`hiding ${hiddenTags.join(filter.hideTagMode === 'all' ? ' AND ' : ' OR ')}`);
  }
  const hiddenHoldings = filter.hideHoldingIds?.length ?? 0;
  if (hiddenHoldings > 0)
    parts.push(`hiding ${hiddenHoldings} holding${hiddenHoldings === 1 ? '' : 's'}`);
  if (filter.includeArchived === true) parts.push('including archived');
  return parts.join(' · ');
}
