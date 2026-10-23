import type { AuditEntry, Page } from '@netnet/contracts';
import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { api, type ApiPath } from './client';

/**
 * The activity log over REST (P3-T1, PRD J7): the audit log newest first with cursor paging. It
 * is read only: a mistake is corrected by another change, which the log then shows like any other.
 */

export const ACTIVITY_KEY = ['activity'] as const;

/** One page of the log. P3-T1 caps `limit` at 100. */
export const ACTIVITY_PAGE_LIMIT = 50;

function pagePath(cursor: string | undefined): ApiPath {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_LIMIT) });
  if (cursor !== undefined) params.set('cursor', cursor);
  return `/activity?${params.toString()}` as ApiPath;
}

export const activityQuery = infiniteQueryOptions({
  queryKey: ACTIVITY_KEY,
  queryFn: ({ pageParam, signal }) =>
    api.get<Page<AuditEntry>>(pagePath(pageParam), signal ? { signal } : {}),
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
});

export function useActivity() {
  return useInfiniteQuery(activityQuery);
}
