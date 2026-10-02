import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { isApiError } from './client';
import { noteDataVersion } from './snapshot';

const MAX_RETRIES = 2;

/** Retry only what can succeed on a second try: no response, or the server's own failure. */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (failures >= MAX_RETRIES) return false;
  if (!isApiError(error)) return false;
  return error.code === 'NETWORK' || error.status >= 500;
}

/** The `dataVersion` a write answered with (architecture §7.2), if it is one. */
export function dataVersionOf(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null || !('dataVersion' in data)) return undefined;
  const { dataVersion } = data;
  return typeof dataVersion === 'number' && Number.isSafeInteger(dataVersion)
    ? dataVersion
    : undefined;
}

/**
 * The app's one QueryClient. Every mutation whose response carries a `dataVersion` moves the
 * snapshot on, so no screen has to remember to.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (data) => {
        const version = dataVersionOf(data);
        if (version !== undefined) noteDataVersion(client, version);
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
  return client;
}

export function QueryProvider({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
