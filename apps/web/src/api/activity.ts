import type { AuditEntry, Page, UndoResult } from '@netnet/contracts';
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api, type ApiPath, type Written } from './client';

/**
 * The activity log over REST (P3-T1, PRD J7): the audit log newest first with cursor paging, and
 * undo of one entry or a whole agent turn. An undo's response carries the new `dataVersion`, which
 * the app's mutation cache picks up by itself, so the snapshot — and every total — refetches. The
 * log is invalidated here, so the undo entry reads at the top.
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

/** After an undo: the log reads again from the top, newest first. */
function useInvalidateActivity() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ACTIVITY_KEY });
  };
}

/** Undoes one log entry (T1: restores `before` exactly, or answers `UNDO_CONFLICT`). */
export function useUndoEntry() {
  const invalidate = useInvalidateActivity();
  return useMutation({
    mutationFn: (entryId: string) =>
      api.post<Written<UndoResult>>(`/activity/${entryId}/undo` as ApiPath),
    onSuccess: () => invalidate(),
  });
}

/** Undoes a whole agent turn, newest first and all or nothing (T1). */
export function useUndoBatch() {
  const invalidate = useInvalidateActivity();
  return useMutation({
    mutationFn: (batchId: string) =>
      api.post<Written<UndoResult>>(`/activity/batches/${batchId}/undo` as ApiPath),
    onSuccess: () => invalidate(),
  });
}
