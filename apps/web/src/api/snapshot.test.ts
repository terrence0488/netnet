import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient, dataVersionOf, shouldRetry } from './query';
import { ApiError } from './client';
import { noteDataVersion, snapshotKey, snapshotQuery } from './snapshot';

interface Snapshot {
  dataVersion: number;
  baseCurrency: string;
}

const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  client.clear();
});

const snapshot = (dataVersion: number) =>
  new Response(JSON.stringify({ dataVersion, baseCurrency: 'SGD' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: `"${dataVersion}"` },
  });

function sentHeaders(): Record<string, string> {
  return (fetchMock.mock.calls.at(-1)?.[1]?.headers ?? {}) as Record<string, string>;
}

describe('the snapshot query', () => {
  it('is keyed by the data version the app knows of', () => {
    expect(snapshotQuery<Snapshot>(client, null).queryKey).toStrictEqual(snapshotKey(null));
    expect(snapshotQuery<Snapshot>(client, 7).queryKey).toStrictEqual(['snapshot', 7]);
  });

  it('loads once, then revalidates with the ETag and keeps its data on 304', async () => {
    fetchMock.mockResolvedValueOnce(snapshot(3));
    const first = await client.fetchQuery(snapshotQuery<Snapshot>(client, null));
    expect(first.dataVersion).toBe(3);
    expect(sentHeaders()['If-None-Match']).toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await client.refetchQueries({ queryKey: ['snapshot'] });
    expect(sentHeaders()['If-None-Match']).toBe('"3"');
    expect(client.getQueryData(snapshotKey(null))).toBe(first);
  });

  it('moves to a newer version after a write, and only to a newer one', async () => {
    fetchMock.mockResolvedValueOnce(snapshot(3));
    await client.fetchQuery(snapshotQuery<Snapshot>(client, null));

    noteDataVersion(client, 3);
    noteDataVersion(client, 2);
    expect(client.getQueryData(['dataVersion'])).toBeUndefined();

    noteDataVersion(client, 4);
    expect(client.getQueryData(['dataVersion'])).toBe(4);

    fetchMock.mockResolvedValueOnce(snapshot(4));
    const next = await client.fetchQuery(snapshotQuery<Snapshot>(client, 4));
    expect(sentHeaders()['If-None-Match']).toBe('"3"');
    expect(next.dataVersion).toBe(4);

    noteDataVersion(client, 4);
    expect(client.getQueryData(['dataVersion'])).toBe(4);
  });
});

describe('retries', () => {
  const failure = (code: 'NETWORK' | 'INTERNAL' | 'NOT_FOUND', status: number) =>
    new ApiError({ code, status, message: 'x' });

  it('retry a missing response or a server failure, twice at most', () => {
    expect(shouldRetry(0, failure('NETWORK', 0))).toBe(true);
    expect(shouldRetry(1, failure('INTERNAL', 500))).toBe(true);
    expect(shouldRetry(2, failure('INTERNAL', 500))).toBe(false);
  });

  it('never retry what the caller must change', () => {
    expect(shouldRetry(0, failure('NOT_FOUND', 404))).toBe(false);
    expect(shouldRetry(0, new Error('render bug'))).toBe(false);
  });
});

describe('a write', () => {
  it('moves the snapshot on by the dataVersion it answered with', async () => {
    const app = createQueryClient();
    const write = app.getMutationCache().build(app, {
      mutationFn: () => Promise.resolve({ result: { id: 'hld_1' }, dataVersion: 9, warnings: [] }),
    });
    await write.execute(undefined);
    expect(app.getQueryData(['dataVersion'])).toBe(9);
    app.clear();
  });

  it('reads a version only from a safe integer', () => {
    expect(dataVersionOf({ dataVersion: 3 })).toBe(3);
    expect(dataVersionOf({ dataVersion: '3' })).toBeUndefined();
    expect(dataVersionOf({ dataVersion: 1.5 })).toBeUndefined();
    expect(dataVersionOf(undefined)).toBeUndefined();
    expect(dataVersionOf(null)).toBeUndefined();
  });
});
