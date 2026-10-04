import { GENERIC_PACK, type Countries, type Pack, type VersionedPack } from '@netnet/contracts';
import { crossRate } from '../content/fx';
import { COUNTRIES_KEY } from '../content/publish';
import { contentStore, type ContentStore } from '../content/store';
import type { LedgerContent, LedgerOptions } from './scope';

/**
 * The Ledger's packs from the content store (architecture §6.5): the user's chain at the versions
 * live now, and any chain by reference at the versions it names. Bodies were validated when they
 * were published.
 */
export function ledgerContent(store: ContentStore, country: string | null): LedgerContent {
  const pack = async (key: string, version?: number): Promise<VersionedPack> => {
    const doc =
      version === undefined
        ? await store.getCurrent('pack', key)
        : await store.getVersion('pack', key, version);
    return { ...(doc.body as Pack), version: doc.version };
  };
  return {
    async chain() {
      const countries = (await store.getCurrent('countries', COUNTRIES_KEY)).body as Countries;
      const own =
        country !== null && Object.hasOwn(countries, country)
          ? countries[country]?.pack
          : undefined;
      const keys = own === undefined || own === GENERIC_PACK ? [GENERIC_PACK] : [own, GENERIC_PACK];
      return Promise.all(keys.map((key) => pack(key)));
    },
    packs: (ref) => Promise.all(ref.map(({ key, version }) => pack(key, version))),
  };
}

/** The running app's options for one user: the live content, the stored rates, their time zone. */
export function appLedgerOptions(profile: {
  country: string | null;
  timeZone: string;
}): LedgerOptions {
  return {
    fx: { crossRate },
    content: ledgerContent(contentStore(), profile.country),
    timeZone: profile.timeZone,
  };
}
