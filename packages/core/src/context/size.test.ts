import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, clipName, utf8Length } from './size';

describe('clipName', () => {
  it('keeps a name of up to 64 characters as it is', () => {
    expect(clipName('Everyday account')).toBe('Everyday account');
    expect(clipName('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('cuts a longer one to 63 and an ellipsis, between code points', () => {
    expect(clipName('a'.repeat(65))).toBe(`${'a'.repeat(63)}…`);
    expect(clipName('😀'.repeat(70))).toBe(`${'😀'.repeat(63)}…`);
  });

  it('never gives more than 64 code points', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (name) => {
        const clipped = clipName(name);
        expect(Array.from(clipped).length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(name.startsWith(clipped.replace(/…$/, ''))).toBe(true);
      }),
    );
  });
});

describe('utf8Length', () => {
  it('counts the bytes UTF-8 writes', () => {
    expect(utf8Length('')).toBe(0);
    expect(utf8Length('a')).toBe(1);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('’')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
    // A lone surrogate is written as U+FFFD.
    expect(utf8Length('\ud800')).toBe(3);
    expect(utf8Length('\udc00a')).toBe(4);
  });

  it('agrees with percent-encoding, which writes each byte once', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(utf8Length(text)).toBe(
          encodeURIComponent(text).replace(/%[0-9A-F]{2}/g, '_').length,
        );
      }),
    );
  });
});
