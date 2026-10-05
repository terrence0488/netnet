import type { Pack, PackRef, VersionedPack } from '@netnet/contracts';
import { queryOptions, useQueries, type QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * The snapshot's pack chain as versioned packs (architecture §6.7): the country's pack, then
 * generic, each at the published version the snapshot names. A published version never changes, so
 * each document is fetched once and kept.
 */

export function packDocQuery(key: string, version: number) {
  return queryOptions({
    queryKey: ['content', 'pack', key, version] as const,
    queryFn: ({ signal }): Promise<VersionedPack> =>
      api
        .get<Pack>(`/content/pack/${key}@${version}`, { signal })
        .then((pack) => ({ ...pack, version })),
    staleTime: Infinity,
  });
}

/** The chain in order, once every document is in; pending, or the first failure, until then. */
export function usePackChain(packRef: PackRef) {
  const docs = useQueries({
    queries: packRef.map(({ key, version }) => packDocQuery(key, version)),
    combine: (results) => {
      const packs: VersionedPack[] = [];
      for (const result of results) {
        if (result.isPending) return { status: 'pending' } as const;
        if (result.isError) return { status: 'error', error: result.error } as const;
        packs.push(result.data);
      }
      return { status: 'ready', packs } as const;
    },
  });
  return docs;
}

/** Warms the cache with the chain, as a test seeds it. */
export async function fetchPackChain(
  client: QueryClient,
  packRef: PackRef,
): Promise<VersionedPack[]> {
  return Promise.all(
    packRef.map(({ key, version }) => client.fetchQuery(packDocQuery(key, version))),
  );
}
