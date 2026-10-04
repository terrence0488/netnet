import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../lib/context';
import { handleError } from '../lib/error-handler';
import { requestContext } from '../lib/request-context';
import { originCheck } from './origin-check';

const OURS = 'https://netnet.example';

const app = new Hono<AppEnv>();
app.use(
  '*',
  requestContext(),
  originCheck(() => [OURS]),
);
app.on(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], ['/api/thing', '/mcp'], (c) =>
  c.text('done'),
);
app.onError(handleError);

async function status(method: string, headers: Record<string, string> = {}): Promise<number> {
  return (await app.request('/api/thing', { method, headers })).status;
}

describe('originCheck()', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'lets %s through from our own origin',
    async (method) => {
      expect(await status(method, { Origin: OURS })).toBe(200);
      expect(await status(method, { Origin: OURS, 'Sec-Fetch-Site': 'same-origin' })).toBe(200);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses %s from another origin', async (method) => {
    for (const origin of [
      'https://evil.example',
      'null',
      `${OURS}.evil.example`,
      'http://netnet.example',
    ]) {
      const res = await app.request('/api/thing', { method, headers: { Origin: origin } });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    }
  });

  it('refuses a request without Origin that the browser says came from another site', async () => {
    expect(await status('POST', { 'Sec-Fetch-Site': 'cross-site' })).toBe(401);
    expect(await status('POST', { 'Sec-Fetch-Site': 'same-site' })).toBe(401);
    expect(await status('POST', { 'Sec-Fetch-Site': 'same-origin' })).toBe(200);
  });

  it('lets through a request with neither header: no browser sent it', async () => {
    expect(await status('POST')).toBe(200);
  });

  it('checks only the REST API: agents reach /mcp with bearer tokens, not cookies', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { Origin: 'https://agent.example' },
    });
    expect(res.status).toBe(200);
  });

  it('never checks a read', async () => {
    expect(await status('GET', { Origin: 'https://evil.example' })).toBe(200);
    expect(await status('HEAD', { 'Sec-Fetch-Site': 'cross-site' })).toBe(200);
  });
});
