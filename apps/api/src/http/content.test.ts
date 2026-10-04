import { errorBodySchema } from '@netnet/contracts';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentStore, type ContentSource } from '../content/store';
import type { AppEnv } from '../lib/context';
import { handleError, handleNotFound } from '../lib/error-handler';
import { noStore, requestContext } from '../lib/request-context';
import { contentRoutes, IMMUTABLE } from './content';

/** The routes as app.ts mounts them, over an in-memory store. */
function appWith(source: ContentSource) {
  const store = createContentStore({ source, clock: () => 0 });
  const app = new Hono<AppEnv>();
  app.use('*', requestContext(), noStore());
  app.route(
    '/api/content',
    contentRoutes(() => store),
  );
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
}

const GENERIC = { id: 'generic', note: 'fictional' };
const source: ContentSource = {
  current: () =>
    Promise.resolve([
      { kind: 'agent', key: 'claude', version: 3 },
      { kind: 'pack', key: 'generic', version: 2 },
    ]),
  body: ({ kind, key, version }) =>
    Promise.resolve(kind === 'pack' && key === 'generic' && version === 2 ? GENERIC : undefined),
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/content/current', () => {
  it('maps each kind to its keys’ live versions, uncached, with no session', async () => {
    const res = await appWith(source).request('/api/content/current');
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ agent: { claude: 3 }, pack: { generic: 2 } });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});

describe('GET /api/content/:kind/:key@:version', () => {
  it('serves the document, cacheable for a year', async () => {
    const res = await appWith(source).request('/api/content/pack/generic@2');
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual(GENERIC);
    expect(res.headers.get('Cache-Control')).toBe(IMMUTABLE);
    expect(IMMUTABLE).toBe('public, max-age=31536000, immutable');
  });

  it('is NOT_FOUND, uncached, for a version that does not exist', async () => {
    const res = await appWith(source).request('/api/content/pack/generic@7');
    expect(res.status).toBe(404);
    expect(errorBodySchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each([
    ['an unknown kind', '/api/content/packs/generic@2', ['kind']],
    ['no version', '/api/content/pack/generic', ['version']],
    ['a version that is not a number', '/api/content/pack/generic@latest', ['version']],
    ['version 0', '/api/content/pack/generic@0', ['version']],
    ['a key in capitals', '/api/content/pack/SG@1', ['key']],
    ['two versions', '/api/content/pack/sg@1@2', ['key']],
  ])('is VALIDATION_FAILED for %s', async (_, path, fields) => {
    const res = await appWith(source).request(path);
    expect(res.status).toBe(400);
    const { error } = errorBodySchema.parse(await res.json());
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(error.fields ?? {})).toStrictEqual(fields);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
