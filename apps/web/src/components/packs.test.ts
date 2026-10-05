import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPackChain, packDocQuery } from './packs';

const fetchMock = vi.fn<typeof fetch>();

const PACK = {
  id: 'generic',
  locale: null,
  currency: null,
  labels: {},
  examples: {},
  meaning: {},
  cadenceDays: {},
  defaults: {},
  questions: {},
  types: [],
  checklist: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function packResponse(pack: unknown) {
  return new Response(JSON.stringify(pack), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('packDocQuery', () => {
  it('fetches the published version once and stamps it on', async () => {
    fetchMock.mockResolvedValueOnce(packResponse({ ...PACK, id: 'sg' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pack = await client.fetchQuery(packDocQuery('sg', 3));
    expect(pack).toMatchObject({ id: 'sg', version: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/content/pack/sg@3');
    client.clear();
  });

  it('fetches the chain in order', async () => {
    fetchMock
      .mockResolvedValueOnce(packResponse({ ...PACK, id: 'sg' }))
      .mockResolvedValueOnce(packResponse({ ...PACK, id: 'generic' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const chain = await fetchPackChain(client, [
      { key: 'sg', version: 2 },
      { key: 'generic', version: 1 },
    ]);
    expect(chain.map((p) => `${p.id}@${p.version}`)).toStrictEqual(['sg@2', 'generic@1']);
    expect(fetchMock.mock.calls.map((call) => call[0])).toStrictEqual([
      '/api/content/pack/sg@2',
      '/api/content/pack/generic@1',
    ]);
    client.clear();
  });
});
