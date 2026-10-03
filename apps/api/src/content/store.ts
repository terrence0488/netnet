import { GENERIC_PACK, type ContentKind, type Countries, type Pack } from '@netnet/contracts';
import { database, type Executor } from '../db/client';
import { contentBody, currentVersions, type ContentRef } from '../db/content';
import { AppError } from '../lib/errors';
import { COUNTRIES_KEY } from './publish';

/**
 * The read side of content (architecture §6.5): what is live is cached for 60 s, and each version,
 * being immutable, for the life of the function instance. Bodies were validated when published.
 */
export interface ContentVersion {
  version: number;
  body: unknown;
}

/** Where the store reads: `core.content_*`, or a stand-in in tests. */
export interface ContentSource {
  current(): Promise<ContentRef[]>;
  /** A version's body, or undefined when there is none. */
  body(ref: ContentRef): Promise<unknown>;
}

export interface ContentStore {
  /** The live version of every document: `{[kind]: {[key]: version}}`. */
  currentVersions(): Promise<Record<string, Record<string, number>>>;
  getCurrent(kind: ContentKind, key: string): Promise<ContentVersion>;
  getVersion(kind: ContentKind, key: string, version: number): Promise<ContentVersion>;
  /** The packs that apply in `country` (ISO 3166-1, or null when unknown): its pack, then generic. */
  getPackChain(country: string | null): Promise<Pack[]>;
}

/** How long what is live is trusted before it is read again. */
export const CURRENT_TTL_MS = 60_000;

/**
 * The country's pack then generic, or generic alone. Same contract as P1-T6's `core.packChain`
 * (`packChain(packs, countryPackKey?)`); this switches to `core.packChain` once that merges.
 */
export function packChain(packs: readonly Pack[], countryPackKey?: string): Pack[] {
  const generic = packs.find((p) => p.id === GENERIC_PACK);
  if (!generic) throw new Error('The generic pack is missing.');
  const own =
    countryPackKey === undefined || countryPackKey === GENERIC_PACK
      ? undefined
      : packs.find((p) => p.id === countryPackKey);
  return own ? [own, generic] : [generic];
}

export interface StoreOptions {
  source: ContentSource;
  /** The clock the 60 s is measured on. */
  clock?: () => number;
}

export function createContentStore({ source, clock = Date.now }: StoreOptions): ContentStore {
  let current: { at: number; versions: Promise<Map<string, number>> } | undefined;
  const versions = new Map<string, Promise<unknown>>();

  const live = (): Promise<Map<string, number>> => {
    const now = clock();
    if (!current || now - current.at >= CURRENT_TTL_MS) {
      const loading = source
        .current()
        .then((rows) => new Map(rows.map((r) => [`${r.kind}/${r.key}`, r.version])));
      current = { at: now, versions: loading };
      // A failed read is not kept: the next call tries again.
      loading.catch(() => {
        if (current?.versions === loading) current = undefined;
      });
    }
    return current.versions;
  };

  const getVersion = async (
    kind: ContentKind,
    key: string,
    version: number,
  ): Promise<ContentVersion> => {
    const id = `${kind}/${key}@${version}`;
    let loading = versions.get(id);
    if (!loading) {
      loading = source.body({ kind, key, version }).then((body) => {
        // Nothing is kept for a version that does not exist (yet), or a failed read.
        if (body === undefined) versions.delete(id);
        return body;
      });
      loading.catch(() => versions.delete(id));
      versions.set(id, loading);
    }
    const body = await loading;
    if (body === undefined) {
      throw new AppError('NOT_FOUND', `There is no ${kind} "${key}" version ${version}.`);
    }
    return { version, body };
  };

  const getCurrent = async (kind: ContentKind, key: string): Promise<ContentVersion> => {
    const version = (await live()).get(`${kind}/${key}`);
    if (version === undefined) {
      throw new AppError('NOT_FOUND', `No ${kind} "${key}" is published.`);
    }
    return getVersion(kind, key, version);
  };

  return {
    async currentVersions() {
      const map: Record<string, Record<string, number>> = {};
      for (const [id, version] of await live()) {
        const [kind = '', key = ''] = id.split('/');
        (map[kind] ??= {})[key] = version;
      }
      return map;
    },
    getCurrent,
    getVersion,
    async getPackChain(country) {
      const countries = (await getCurrent('countries', COUNTRIES_KEY)).body as Countries;
      const packKey =
        country !== null && Object.hasOwn(countries, country)
          ? countries[country]?.pack
          : undefined;
      const keys = packKey === undefined || packKey === GENERIC_PACK ? [] : [packKey];
      const packs = await Promise.all(
        [GENERIC_PACK, ...keys].map(async (key) => (await getCurrent('pack', key)).body as Pack),
      );
      return packChain(packs, packKey);
    },
  };
}

/** `core.content_*` as a `ContentSource`. */
export function databaseContent(db: () => Executor): ContentSource {
  return {
    current: () => currentVersions(db()),
    body: (ref) => contentBody(db(), ref),
  };
}

let shared: ContentStore | undefined;

/** The store the running app uses: the app's database, the real clock. */
export function contentStore(): ContentStore {
  shared ??= createContentStore({ source: databaseContent(database) });
  return shared;
}

/** The live version of a document and its body (cached 60 s). NOT_FOUND when none is published. */
export function getCurrent(kind: ContentKind, key: string): Promise<ContentVersion> {
  return contentStore().getCurrent(kind, key);
}

/** One version of a document (cached indefinitely: versions are immutable). */
export function getVersion(
  kind: ContentKind,
  key: string,
  version: number,
): Promise<ContentVersion> {
  return contentStore().getVersion(kind, key, version);
}

/** The packs for `country`: its own pack (if it has one), then generic. */
export function getPackChain(country: string | null): Promise<Pack[]> {
  return contentStore().getPackChain(country);
}
