import { describe, expect, it } from 'vitest';
import reviewsJson from '../../../content/reviews.json' with { type: 'json' };
import { reviewsSchema, validateReviews, type Reviews } from './content';

/**
 * The review record (CONVENTIONS §8): a pack key → the hash of the reviewed version, who reviewed
 * it and when. Every key names a published pack, and hashes are 64 hex characters.
 */

const HASH = 'ab'.repeat(32);
const PACKS: ReadonlySet<string> = new Set(['generic', 'sg', 'my', 'gb']);

const valid = (): Reviews => ({
  sg: { sha256: HASH, reviewer: 'F. Reviewer', on: '2026-10-25' },
  gb: {
    sha256: 'c'.repeat(64),
    reviewer: 'FR',
    on: '2026-02-28',
    notes: 'Checked against the operator’s own pages.',
  },
});

function errorsOf(body: unknown): string[] {
  return validateReviews(body, PACKS, 'reviews.json').map((e) => `${e.path}: ${e.message}`);
}

describe('reviewsSchema', () => {
  it('accepts a review per pack, with or without notes', () => {
    expect(reviewsSchema.parse(valid())).toStrictEqual(valid());
    expect(errorsOf(valid())).toStrictEqual([]);
  });

  it('accepts the real record, which starts empty', () => {
    expect(reviewsSchema.parse(reviewsJson)).toStrictEqual({});
    expect(errorsOf(reviewsJson)).toStrictEqual([]);
  });

  it('rejects a hash that is not 64 lowercase hex characters', () => {
    for (const sha256 of ['ab'.repeat(31), 'AB'.repeat(32), `${'a'.repeat(63)}g`, '']) {
      expect(errorsOf({ sg: { ...valid().sg, sha256 } }), sha256).toStrictEqual([
        'sg.sha256: Use the pack’s SHA-256 as content:publish computes it: 64 lowercase hex characters.',
      ]);
    }
  });

  it('rejects a review with no reviewer, no real date, an empty note or an unknown field', () => {
    expect(
      errorsOf({
        sg: { sha256: HASH, reviewer: '', on: '2026-02-30', notes: '' },
        gb: { sha256: HASH, reviewer: 'FR', on: '2026-10-25', approvedBy: 'FR' },
        my: { sha256: HASH, reviewer: 'FR' },
      }).map((e) => e.split(':')[0]),
    ).toStrictEqual(['sg.reviewer', 'sg.on', 'sg.notes', 'gb', 'my.on']);
  });

  it('rejects a key that is not a pack key, with the key format’s message', () => {
    expect(errorsOf({ SG: valid().sg })).toStrictEqual([
      'SG: Use "generic" or a lowercase ISO 3166-1 code, such as "sg".',
    ]);
  });

  it('is a map, not a list', () => {
    expect(errorsOf([valid().sg])).toHaveLength(1);
  });
});

describe('validateReviews', () => {
  it('rejects a review of a pack that is not published, such as a draft', () => {
    expect(errorsOf({ ...valid(), zz: valid().sg })).toStrictEqual([
      'zz: There is no pack "zz". A pack\'s review is recorded as it moves out of drafts.',
    ]);
  });

  it('names the document it was given', () => {
    const [error] = validateReviews({ zz: valid().sg }, PACKS, 'elsewhere.json');
    expect(error?.doc).toBe('elsewhere.json');
  });
});
