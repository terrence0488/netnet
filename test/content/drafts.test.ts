import { isDeepStrictEqual } from 'node:util';
import { countriesSchema, packSchema, type Pack } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { readContent, readDrafts } from '../../scripts/content-check';

/**
 * The seven draft launch packs (PRD §2.3, CONVENTIONS §8), held to the pack rules a schema cannot
 * check: each lists only what differs from generic, states its reasons in its own words and no age,
 * follows the country list's currency, and no country points at it until its review lands.
 */

const DRAFT_IDS = ['au', 'hk', 'id', 'in', 'ph', 'th', 'vn'];

const published = readContent().docs;
const generic = packSchema.parse(published.find((d) => d.doc === 'packs/generic.json')?.body);
const countries = countriesSchema.parse(published.find((d) => d.kind === 'countries')?.body);
const drafts: Pack[] = readDrafts().docs.map((d) => packSchema.parse(d.body));

/** Every outcome a pack states: its defaults and its questions' answers. */
const outcomes = (p: Pack) => [
  ...Object.values(p.defaults),
  ...Object.values(p.questions).flatMap((q) => q.answers),
];

describe('the draft packs', () => {
  it('are the seven remaining launch markets', () => {
    expect(drafts.map((p) => p.id)).toStrictEqual(DRAFT_IDS);
  });

  it('take their currency from the country list and set a locale', () => {
    for (const p of drafts) {
      expect(p.currency, p.id).toBe(countries[p.id.toUpperCase()]?.currency);
      expect(p.locale, p.id).toBe(`en-${p.id.toUpperCase()}`);
    }
  });

  it('are not yet any country’s pack', () => {
    const packed = Object.values(countries).flatMap((c) => (c.pack ? [c.pack] : []));
    expect(packed.filter((id) => DRAFT_IDS.includes(id))).toStrictEqual([]);
  });

  it('list only what differs from generic', () => {
    const sections = [
      'labels',
      'examples',
      'meaning',
      'cadenceDays',
      'defaults',
      'questions',
    ] as const;
    for (const p of drafts) {
      for (const section of sections) {
        const own: Record<string, unknown> = p[section];
        const common: Record<string, unknown> = generic[section];
        const same = Object.keys(own).filter((u) => isDeepStrictEqual(own[u], common[u]));
        expect(same, `${p.id} ${section}`).toStrictEqual([]);
      }
      expect(isDeepStrictEqual(p.checklist, generic.checklist), p.id).toBe(false);
    }
  });

  it('state their own reasons, and no age', () => {
    const common = new Set(outcomes(generic).map((o) => o.reason));
    for (const p of drafts) {
      for (const { reason, until } of outcomes(p)) {
        expect(common.has(reason), `${p.id}: ${reason}`).toBe(false);
        expect(`${reason} ${until ?? ''}`, p.id).not.toMatch(/\d/);
      }
    }
  });
});
