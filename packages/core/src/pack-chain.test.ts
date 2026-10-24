import { packSchema, type VersionedPack } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import {
  chainValue,
  packChain,
  requireChainValue,
  typeLabel,
  typeLabelOfSnapshot,
} from './pack-chain';
import { COUNTRY, GENERIC } from './testing/fixtures';

/** The pack document itself, without the version the chain carries. */
function unversioned(pack: VersionedPack): Omit<VersionedPack, 'version'> {
  const document: Partial<VersionedPack> = { ...pack };
  delete document.version;
  return document as Omit<VersionedPack, 'version'>;
}

describe('the test packs', () => {
  it('are valid packs', () => {
    expect(packSchema.parse(unversioned(GENERIC))).toStrictEqual(unversioned(GENERIC));
    expect(packSchema.parse(unversioned(COUNTRY))).toStrictEqual(unversioned(COUNTRY));
  });
});

describe('packChain', () => {
  const packs = [GENERIC, COUNTRY];

  it("is the country's pack, then generic", () => {
    expect(packChain(packs, 'qz')).toStrictEqual([COUNTRY, GENERIC]);
  });

  it.each([undefined, null, 'generic', 'zz', ''])('is generic alone for %j', (key) => {
    expect(packChain(packs, key)).toStrictEqual([GENERIC]);
  });

  it('keeps what the packs carry, such as their versions', () => {
    expect(packChain(packs, 'qz').map((p) => p.version)).toStrictEqual([2, 4]);
  });

  it('needs a generic pack', () => {
    expect(() => packChain([COUNTRY], 'qz')).toThrow('There is no generic pack');
  });
});

describe('chain lookups', () => {
  const chain = packChain([GENERIC, COUNTRY], 'qz');

  it("reads the country's value first, then generic's, key by key", () => {
    expect(chainValue(chain, 'labels', 'cash')).toBe('Current account');
    expect(chainValue(chain, 'labels', 'property')).toBe('Label property');
    expect(chainValue(chain, 'cadenceDays', 'cash')).toBe(14);
    expect(chainValue(chain, 'cadenceDays', 'property')).toBe(365);
    expect(chainValue(chain, 'defaults', 'wrapper')?.reason).toBe(
      'the scheme keeps it until you retire',
    );
    expect(chainValue(chain, 'examples', 'cash')).toBeUndefined();
  });

  it('fails loudly when a chain does not end with generic', () => {
    expect(() => requireChainValue([COUNTRY], 'meaning', 'cash')).toThrow(
      'The pack chain has no meaning for "cash": it must end with generic.',
    );
  });
});

describe('typeLabel', () => {
  const chain = packChain([GENERIC, COUNTRY], 'qz');

  it("is the user's own name when they renamed the type", () => {
    expect(
      typeLabel(chain, { universal: 'loan', packTypeKey: 'auto_loan', customName: 'Van loan' }),
    ).toBe('Van loan');
  });

  it("is the pack type's label, from the current chain", () => {
    expect(
      typeLabel(chain, { universal: 'loan', packTypeKey: 'auto_loan', customName: null }),
    ).toBe('Auto loan');
  });

  it("is the universal type's label otherwise, key by key", () => {
    expect(typeLabel(chain, { universal: 'cash', packTypeKey: null, customName: null })).toBe(
      'Current account',
    );
    expect(typeLabel(chain, { universal: 'loan', packTypeKey: null, customName: '' })).toBe(
      'Label loan',
    );
  });

  it("follows the current pack: a pack type the chain lacks shows its universal type's label", () => {
    const generic = packChain([GENERIC, COUNTRY], null);
    expect(
      typeLabel(generic, { universal: 'loan', packTypeKey: 'auto_loan', customName: null }),
    ).toBe('Label loan');
  });
});

describe('typeLabelOfSnapshot', () => {
  const chain = packChain([GENERIC, COUNTRY], 'qz');

  it('names a stored type as typeLabel does', () => {
    const snapshot = (customName: string | null, packTypeKey: string | null) => ({
      id: 'typ_01',
      universal: 'loan',
      packTypeKey,
      customName,
      sortOrder: 3,
    });
    expect(typeLabelOfSnapshot(chain, snapshot('Van loan', 'auto_loan'))).toBe('Van loan');
    expect(typeLabelOfSnapshot(chain, snapshot(null, 'auto_loan'))).toBe('Auto loan');
    expect(typeLabelOfSnapshot(chain, snapshot(null, null))).toBe('Label loan');
    expect(typeLabelOfSnapshot(chain, snapshot(null, 'retired_key'))).toBe('Label loan');
    expect(
      typeLabelOfSnapshot(packChain([GENERIC, COUNTRY], null), snapshot(null, 'auto_loan')),
    ).toBe('Label loan');
  });

  it('reads an absent pack key or name as none', () => {
    expect(typeLabelOfSnapshot(chain, { universal: 'cash' })).toBe('Current account');
    expect(typeLabelOfSnapshot(chain, { universal: 'cash', customName: 'Pot' })).toBe('Pot');
  });

  it.each([
    ['nothing', null],
    ['no object', 'loan'],
    ['an array', ['loan']],
    ['no universal type', { packTypeKey: 'auto_loan', customName: 'Van loan' }],
    ['an unknown universal type', { universal: 'yacht', customName: 'Boat' }],
    ['an inherited key as its universal type', { universal: 'toString', customName: null }],
    ['a pack key that is not text', { universal: 'loan', packTypeKey: 7, customName: null }],
    ['a name that is not text', { universal: 'loan', packTypeKey: null, customName: { a: 1 } }],
  ])('is undefined for %s', (_, snapshot) => {
    expect(typeLabelOfSnapshot(chain, snapshot)).toBeUndefined();
  });
});
