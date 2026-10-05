import type { ContentKind, Countries } from '@netnet/contracts';
import { queryOptions } from '@tanstack/react-query';
import { api } from './client';

/**
 * Administered content over REST (architecture §7.2, §6.5): which version of each document is
 * live, then that version, which never changes once published. Packs, countries and agent guides
 * all come this way; none of it is hard-coded (N10).
 */

/** `GET /api/content/current`: kind → key → live version. */
export type ContentVersions = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** The live version of one document: its current version, then the document itself. */
export async function liveDocument<T>(
  kind: ContentKind,
  key: string,
  signal?: AbortSignal,
): Promise<T> {
  const options = signal ? { signal } : {};
  const versions = await api.get<ContentVersions>('/content/current', options);
  const version = versions[kind]?.[key];
  if (version === undefined) throw new Error(`No live version of ${kind}/${key}.`);
  return api.get<T>(`/content/${kind}/${key}@${version}`, options);
}

/** Every country NetNet knows, with its currency and pack (`countries.json`). */
export const countriesQuery = queryOptions({
  queryKey: ['content', 'countries'] as const,
  queryFn: ({ signal }) => liveDocument<Countries>('countries', 'countries', signal),
  staleTime: Infinity,
});
