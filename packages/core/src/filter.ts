import type { HoldingFilter, HoldingIn, TagMode } from '@netnet/contracts';

function hasTags(holding: HoldingIn, tagIds: readonly string[], mode: TagMode = 'any'): boolean {
  return mode === 'all'
    ? tagIds.every((t) => holding.tagIds.includes(t))
    : tagIds.some((t) => holding.tagIds.includes(t));
}

/**
 * The holdings a figure counts: only those the filter keeps (Home's Show Only and Don't Show,
 * J4; Insights' filters and exclusions, J11). Archived holdings stay out (PRD J2) unless the
 * filter includes them (J4's archived inclusion). An empty list in the filter restricts nothing.
 */
export function filterHoldings<H extends HoldingIn>(
  holdings: readonly H[],
  filter: HoldingFilter = {},
): H[] {
  const { show = 'all', typeIds = [], tagIds = [], hideTypeIds = [], hideTagIds = [] } = filter;
  const hideHoldingIds = filter.hideHoldingIds ?? [];
  const includeArchived = filter.includeArchived ?? false;
  return holdings.filter(
    (h) =>
      (includeArchived || !h.archived) &&
      (show === 'all' || (show === 'assets' ? h.kind === 'asset' : h.kind === 'liability')) &&
      (typeIds.length === 0 || typeIds.includes(h.typeId)) &&
      (tagIds.length === 0 || hasTags(h, tagIds, filter.tagMode)) &&
      !hideTypeIds.includes(h.typeId) &&
      (hideTagIds.length === 0 || !hasTags(h, hideTagIds, filter.hideTagMode)) &&
      !hideHoldingIds.includes(h.id),
  );
}
