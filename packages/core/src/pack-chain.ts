import type { GENERIC_PACK, Pack, Universal, UserTypeIn } from '@netnet/contracts';

/**
 * The pack chain (architecture §6.7): the country's pack, then generic. Everything that differs
 * by place is read through it, key by key, so a country pack lists only what differs.
 */

const GENERIC: typeof GENERIC_PACK = 'generic';

/** The country's pack then generic, or generic alone (no country, or no pack for it). */
export function packChain<P extends Pack>(
  packs: readonly P[],
  countryPackKey?: string | null,
): P[] {
  const generic = packs.find((p) => p.id === GENERIC);
  if (!generic) throw new Error('There is no generic pack, and every chain ends with it.');
  const country =
    countryPackKey && countryPackKey !== GENERIC
      ? packs.find((p) => p.id === countryPackKey)
      : undefined;
  return country ? [country, generic] : [generic];
}

/** The sections a pack keys by universal type. */
type Section = 'labels' | 'examples' | 'meaning' | 'cadenceDays' | 'defaults' | 'questions';
type SectionValue<S extends Section> = NonNullable<Pack[S][Universal]>;

/** The first pack in the chain that defines `section` for `u`, with its value. */
export function findInChain<P extends Pack, S extends Section>(
  chain: readonly P[],
  section: S,
  u: Universal,
): { pack: P; value: SectionValue<S> } | undefined {
  for (const pack of chain) {
    const value = (pack[section] as Partial<Record<Universal, SectionValue<S>>>)[u];
    if (value !== undefined) return { pack, value };
  }
  return undefined;
}

/** `section`'s value for `u`, from the first pack in the chain that defines it. */
export function chainValue<S extends Section>(
  chain: readonly Pack[],
  section: S,
  u: Universal,
): SectionValue<S> | undefined {
  return findInChain(chain, section, u)?.value;
}

/** As `chainValue`, for what generic defines for every type (content validation checks it). */
export function requireChainValue<S extends 'labels' | 'meaning' | 'cadenceDays'>(
  chain: readonly Pack[],
  section: S,
  u: Universal,
): SectionValue<S> {
  const value = chainValue(chain, section, u);
  if (value === undefined) {
    throw new Error(`The pack chain has no ${section} for "${u}": it must end with generic.`);
  }
  return value;
}

/** A type's name: the user's own, else its pack type's label, else its universal type's label. */
export function typeLabel(chain: readonly Pack[], type: UserTypeIn): string {
  if (type.customName) return type.customName;
  if (type.packTypeKey !== null) {
    for (const pack of chain) {
      const packType = pack.types.find((t) => t.key === type.packTypeKey);
      if (packType) return packType.label;
    }
  }
  return requireChainValue(chain, 'labels', type.universal);
}
