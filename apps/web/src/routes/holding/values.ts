import type { Page, Value } from '@netnet/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { since } from '../../components';

/**
 * A holding's values over REST (architecture §7.2): newest first, in pages. The snapshot's compact
 * tuples drive the hero's figure; these full values carry who wrote each one and when.
 */

/** Values per page: enough that paging is rare, few enough to stay quick. */
export const VALUES_PAGE = 50;

export function holdingValuesQuery(holdingId: string) {
  return {
    queryKey: ['holdings', holdingId, 'values'] as const,
    queryFn: async ({
      pageParam,
      signal,
    }: {
      pageParam: string | undefined;
      signal: AbortSignal;
    }): Promise<Page<Value>> => {
      const params = new URLSearchParams({ limit: String(VALUES_PAGE) });
      if (pageParam) params.set('cursor', pageParam);
      return api.get<Page<Value>>(`/holdings/${holdingId}/values?${params}`, { signal });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Value>) => last.nextCursor ?? undefined,
  };
}

export function useHoldingValues(holdingId: string) {
  return useInfiniteQuery(holdingValuesQuery(holdingId));
}

/** "Added 3 days ago", naming the agent only when one wrote it (design-system §2.1, J6). */
export function valueFooter(
  value: Pick<Value, 'source' | 'clientName' | 'enteredAt'>,
  now?: number,
): string {
  const when = since(value.enteredAt, now);
  if (value.source === 'agent') return `Added ${when} by ${value.clientName ?? 'your agent'}`;
  return `Added ${when}`;
}
