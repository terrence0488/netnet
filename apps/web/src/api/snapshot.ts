import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { send } from './client';

/**
 * The snapshot (`GET /api/snapshot`, architecture §7.2) is loaded once and every figure is computed
 * from it by core. Its query is keyed by `dataVersion`: the latest version the app knows of. A
 * write's response carries the new version; `noteDataVersion` moves the key there, so the snapshot
 * refetches exactly when the data changed. The previous snapshot stays on screen meanwhile.
 */

/** What the app needs to know of any snapshot; its full type comes from packages/contracts. */
export interface Versioned {
  readonly dataVersion: number;
}

const VERSION_KEY = ['dataVersion'] as const;

export function snapshotKey(dataVersion: number | null) {
  return ['snapshot', dataVersion] as const;
}

/** The ETag each snapshot came with, echoed back as If-None-Match to revalidate it. */
const etags = new WeakMap<object, string>();

/** The newest snapshot in the cache, whichever version key it sits under. */
function latestSnapshot<T extends Versioned>(client: QueryClient): T | undefined {
  let latest: T | undefined;
  for (const [, data] of client.getQueriesData<T>({ queryKey: ['snapshot'] })) {
    if (data && (!latest || data.dataVersion > latest.dataVersion)) latest = data;
  }
  return latest;
}

export function snapshotQuery<T extends Versioned>(
  client: QueryClient,
  dataVersion: number | null,
) {
  return queryOptions({
    queryKey: snapshotKey(dataVersion),
    queryFn: async ({ signal }): Promise<T> => {
      const previous = latestSnapshot<T>(client);
      const etag = previous && etags.get(previous);
      const sent = await send<T>('GET', '/snapshot', undefined, {
        signal,
        ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
      });
      if (sent.status === 304 && previous) return previous;
      if (!sent.data) throw new Error('The snapshot came back empty.');
      if (sent.etag) etags.set(sent.data, sent.etag);
      return sent.data;
    },
    placeholderData: keepPreviousData,
  });
}

/** The latest data version the app knows of, null until a write reports one. */
function useKnownVersion(): number | null {
  const { data } = useQuery<number | null>({
    queryKey: VERSION_KEY,
    queryFn: () => null,
    initialData: null,
    enabled: false,
    staleTime: Infinity,
  });
  return data;
}

export function useSnapshot<T extends Versioned>() {
  const client = useQueryClient();
  return useQuery(snapshotQuery<T>(client, useKnownVersion()));
}

/** After a write: its response's `dataVersion` moves the snapshot on when it is newer. */
export function noteDataVersion(client: QueryClient, dataVersion: number): void {
  const known = client.getQueryData<number | null>(VERSION_KEY) ?? -1;
  const shown = latestSnapshot(client)?.dataVersion ?? -1;
  if (dataVersion > Math.max(known, shown)) client.setQueryData(VERSION_KEY, dataVersion);
}
