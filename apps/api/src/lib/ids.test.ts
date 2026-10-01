import { describe, expect, it } from 'vitest';
import { ID_PREFIXES, isId, newId } from './ids';

const zeros = () => new Uint8Array(10);
const ones = () => new Uint8Array(10).fill(255);

describe('newId', () => {
  it.each(ID_PREFIXES)('makes a %s_ id of a 26-character ULID', (prefix) => {
    const id = newId(prefix);
    expect(id).toMatch(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`));
    expect(isId(id, prefix)).toBe(true);
  });

  it('encodes the time in the first ten characters and the randomness in the rest', () => {
    expect(newId('hld', 0, zeros)).toBe('hld_00000000000000000000000000');
    expect(newId('hld', 2 ** 48 - 1, ones)).toBe('hld_7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
    // The ULID specification's example time.
    expect(newId('val', 1469918176385, zeros).slice(4, 14)).toBe('01ARYZ6S41');
  });

  it('encodes each random byte where the ULID specification puts it', () => {
    const bytes = () => Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0, 0x1f]);
    expect(newId('tag', 0, bytes).slice(14)).toBe('000000010000000Z');
  });

  it('sorts by creation time', () => {
    const earlier = newId('aud', 1_700_000_000_000, ones);
    const later = newId('aud', 1_700_000_000_001, zeros);
    expect(earlier < later).toBe(true);
  });

  it('differs between calls in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('bat', 1_700_000_000_000)));
    expect(ids.size).toBe(1000);
  });

  it('refuses a time outside 48 bits and a random source of the wrong size', () => {
    expect(() => newId('usr', -1)).toThrow(RangeError);
    expect(() => newId('usr', 2 ** 48)).toThrow(RangeError);
    expect(() => newId('usr', 1.5)).toThrow(RangeError);
    expect(() => newId('usr', 0, () => new Uint8Array(9))).toThrow(RangeError);
  });
});

describe('isId', () => {
  it('accepts a well-formed id and checks the prefix when one is given', () => {
    const id = newId('con', 1_700_000_000_000, zeros);
    expect(isId(id)).toBe(true);
    expect(isId(id, 'con')).toBe(true);
    expect(isId(id, 'att')).toBe(false);
  });

  it.each([
    ['an unknown prefix', 'xyz_01ARYZ6S410000000000000000'],
    ['no prefix', '01ARYZ6S410000000000000000'],
    ['a short ULID', 'hld_01ARYZ6S41000000000000000'],
    ['a letter outside the alphabet', 'hld_01ARYZ6S41000000000000000U'],
    ['lower case', 'hld_01aryz6s410000000000000000'],
    ['a time beyond 48 bits', 'hld_80000000000000000000000000'],
    ['not a string', 42],
  ])('rejects %s', (_, value) => {
    expect(isId(value)).toBe(false);
  });
});
