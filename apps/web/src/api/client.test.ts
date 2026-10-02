import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, isApiError } from './client';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [input, init] = call;
  return [
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    init ?? {},
  ];
}

describe('api', () => {
  it('reads from /api on the same origin, with the session cookie', async () => {
    fetchMock.mockResolvedValue(json({ country: 'XX' }));
    await expect(api.get<{ country: string }>('/geo')).resolves.toStrictEqual({ country: 'XX' });
    const [url, init] = lastCall();
    expect(url).toBe('/api/geo');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
    expect(init.headers).toStrictEqual({ Accept: 'application/json' });
  });

  it('sends a body as JSON', async () => {
    fetchMock.mockResolvedValue(json({ result: { id: 'tag_1' }, dataVersion: 4, warnings: [] }));
    await api.post('/tags', { name: 'Travel fund' });
    const [, init] = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Travel fund"}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('patches and deletes', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.patch<void>('/me', { timeZone: 'Etc/UTC' })).resolves.toBeUndefined();
    expect(lastCall()[1].method).toBe('PATCH');
    await expect(api.del<void>('/tags/tag_1')).resolves.toBeUndefined();
    expect(lastCall()[1].method).toBe('DELETE');
  });

  it('turns the error body into a typed ApiError, details included', async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            code: 'LIKELY_DUPLICATE',
            message: 'A holding with this name exists.',
            candidates: [{ id: 'hld_1' }],
          },
        },
        409,
      ),
    );
    const error: unknown = await api
      .post('/holdings', { name: 'Savings' })
      .catch((e: unknown) => e);
    expect(isApiError(error, 'LIKELY_DUPLICATE')).toBe(true);
    expect(error).toMatchObject({
      status: 409,
      message: 'A holding with this name exists.',
      fields: {},
      details: { candidates: [{ id: 'hld_1' }] },
    });
  });

  it('keeps the fields of a validation failure and the request id of an internal one', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Fix the amount.',
            fields: { amount: 'a decimal string' },
          },
        },
        400,
      ),
    );
    await expect(api.post('/holdings', {})).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { amount: 'a decimal string' },
    });
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'INTERNAL', message: 'Unexpected.', requestId: 'req_1' } }, 500),
    );
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'INTERNAL', requestId: 'req_1' });
  });

  it('treats a response without the contract error body as INTERNAL', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });

  it('treats a success without a JSON body as INTERNAL', async () => {
    fetchMock.mockResolvedValue(new Response('<html>ok</html>', { status: 200 }));
    await expect(api.get('/me')).rejects.toMatchObject({ code: 'INTERNAL', status: 200 });
  });

  it('reports NETWORK when no response arrives', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error: unknown = await api.get('/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NETWORK', status: 0 });
  });

  it('lets a cancelled request through as the abort, not as a failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    await expect(api.get('/me', { signal: controller.signal })).rejects.toBe(abort);
  });
});
