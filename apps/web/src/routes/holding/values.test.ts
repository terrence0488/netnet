import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdingValuesQuery, VALUES_PAGE, valueFooter } from './values';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('valueFooter', () => {
  const now = new Date('2026-09-23T12:00:00Z').getTime();
  it('names you for a value entered here', () => {
    expect(
      valueFooter({ source: 'web', clientName: null, enteredAt: '2026-09-23T11:59:40Z' }, now),
    ).toBe('Added just now by you');
  });

  it('names the agent that wrote it', () => {
    expect(
      valueFooter(
        { source: 'agent', clientName: 'Claude', enteredAt: '2026-09-20T12:00:00Z' },
        now,
      ),
    ).toBe('Added 3 days ago by Claude');
  });

  it('falls back to “your agent” when the name is missing', () => {
    expect(
      valueFooter({ source: 'agent', clientName: null, enteredAt: '2026-09-20T12:00:00Z' }, now),
    ).toBe('Added 3 days ago by your agent');
  });
});

describe('holdingValuesQuery', () => {
  it('asks for the first page newest first', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.fetchInfiniteQuery(holdingValuesQuery('hld_1'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/holdings/hld_1/values?limit=${VALUES_PAGE}`);
    client.clear();
  });

  it('follows the cursor for older values', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const query = holdingValuesQuery('hld_1');
    await query.queryFn({ pageParam: 'opaque-cursor', signal: new AbortController().signal });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/holdings/hld_1/values?limit=${VALUES_PAGE}&cursor=opaque-cursor`,
    );
    expect(query.getNextPageParam({ items: [], nextCursor: 'more' })).toBe('more');
    expect(query.getNextPageParam({ items: [], nextCursor: null })).toBeUndefined();
  });
});
