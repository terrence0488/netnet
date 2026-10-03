import type { Pack } from '@netnet/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ContentRef } from '../db/content';
import { AppError } from '../lib/errors';
import { createContentStore, CURRENT_TTL_MS, packChain, type ContentSource } from './store';

/** A minimal pack: only `id` matters to the chain. */
const pack = (id: string) => ({ id }) as unknown as Pack;

/** An in-memory content_* with call counts, and what is live changeable mid-test. */
function source() {
  const live: ContentRef[] = [
    { kind: 'countries', key: 'countries', version: 1 },
    { kind: 'pack', key: 'generic', version: 2 },
    { kind: 'pack', key: 'sg', version: 1 },
  ];
  const bodies = new Map<string, unknown>([
    ['countries/countries@1', { SG: { currency: 'SGD', pack: 'sg' }, FR: { currency: 'EUR' } }],
    ['pack/generic@1', pack('generic')],
    ['pack/generic@2', pack('generic')],
    ['pack/sg@1', pack('sg')],
  ]);
  const fake = {
    live,
    current: vi.fn(() => Promise.resolve(live.map((r) => ({ ...r })))),
    body: vi.fn((ref: ContentRef) =>
      Promise.resolve(bodies.get(`${ref.kind}/${ref.key}@${ref.version}`)),
    ),
  } satisfies ContentSource & { live: ContentRef[] };
  return fake;
}

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => void (now += ms) };
}

describe('getCurrent', () => {
  it('reads what is live once per 60 s, on the clock it is given', async () => {
    const src = source();
    const time = clock();
    const store = createContentStore({ source: src, clock: time.now });

    expect(await store.getCurrent('pack', 'generic')).toStrictEqual({
      version: 2,
      body: pack('generic'),
    });
    src.live[1] = { kind: 'pack', key: 'generic', version: 1 };
    time.advance(CURRENT_TTL_MS - 1);
    expect((await store.getCurrent('pack', 'generic')).version).toBe(2);
    expect(src.current).toHaveBeenCalledTimes(1);

    time.advance(1);
    expect((await store.getCurrent('pack', 'generic')).version).toBe(1);
    expect(src.current).toHaveBeenCalledTimes(2);
  });

  it('shares one read between concurrent callers', async () => {
    const src = source();
    const store = createContentStore({ source: src, clock: clock().now });
    await Promise.all([
      store.getCurrent('pack', 'generic'),
      store.getCurrent('pack', 'sg'),
      store.currentVersions(),
    ]);
    expect(src.current).toHaveBeenCalledTimes(1);
  });

  it('is NOT_FOUND for a document that is not published', async () => {
    const store = createContentStore({ source: source(), clock: clock().now });
    const error = await store.getCurrent('agent', 'claude').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('tries again after a failed read instead of keeping the failure', async () => {
    const src = source();
    src.current.mockRejectedValueOnce(new Error('database asleep'));
    const store = createContentStore({ source: src, clock: clock().now });
    await expect(store.getCurrent('pack', 'generic')).rejects.toThrow('database asleep');
    expect((await store.getCurrent('pack', 'generic')).version).toBe(2);
  });
});

describe('getVersion', () => {
  it('reads each version once, however much time passes', async () => {
    const src = source();
    const time = clock();
    const store = createContentStore({ source: src, clock: time.now });
    await store.getVersion('pack', 'sg', 1);
    time.advance(365 * 24 * 60 * 60 * 1000);
    await store.getVersion('pack', 'sg', 1);
    await store.getCurrent('pack', 'sg');
    expect(src.body).toHaveBeenCalledTimes(1);
  });

  it('is NOT_FOUND for a version that does not exist, and does not remember that', async () => {
    const src = source();
    const store = createContentStore({ source: src, clock: clock().now });
    await expect(store.getVersion('pack', 'sg', 9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.getVersion('pack', 'sg', 9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(src.body).toHaveBeenCalledTimes(2);
  });
});

describe('currentVersions', () => {
  it('maps kind to key to version', async () => {
    const store = createContentStore({ source: source(), clock: clock().now });
    expect(await store.currentVersions()).toStrictEqual({
      countries: { countries: 1 },
      pack: { generic: 2, sg: 1 },
    });
  });
});

describe('getPackChain', () => {
  const store = () => createContentStore({ source: source(), clock: clock().now });

  it('is the country’s pack, then generic', async () => {
    expect((await store().getPackChain('SG')).map((p) => p.id)).toStrictEqual(['sg', 'generic']);
  });

  it('is generic alone for a country without a pack, an unknown one, or none', async () => {
    for (const country of ['FR', 'ZZ', null]) {
      expect((await store().getPackChain(country)).map((p) => p.id)).toStrictEqual(['generic']);
    }
  });
});

describe('packChain (core.packChain’s contract)', () => {
  const packs = [pack('generic'), pack('sg'), pack('my')];

  it('puts the country’s pack before generic, or gives generic alone', () => {
    expect(packChain(packs, 'my').map((p) => p.id)).toStrictEqual(['my', 'generic']);
    expect(packChain(packs).map((p) => p.id)).toStrictEqual(['generic']);
    expect(packChain(packs, 'generic').map((p) => p.id)).toStrictEqual(['generic']);
    expect(packChain(packs, 'gb').map((p) => p.id)).toStrictEqual(['generic']);
  });

  it('needs the generic pack', () => {
    expect(() => packChain([pack('sg')], 'sg')).toThrow('generic');
  });
});
