import { describe, expect, it } from 'vitest';
import { accessBucket, accessRule, resolveAccess } from './access';
import { packChain } from './pack-chain';
import { COUNTRY, GENERIC } from './testing/fixtures';

const generic = packChain([GENERIC, COUNTRY], null);
const country = packChain([GENERIC, COUNTRY], 'qz');

describe('resolveAccess', () => {
  it('applies the default, with its reason, when the type asks nothing', () => {
    expect(resolveAccess(generic, 'cash')).toStrictEqual({
      access: 'accessible',
      reason: 'it’s money in the bank',
      basis: { via: 'default', pack: 'generic', pack_version: 4, question: null, answer: null },
    });
    expect(resolveAccess(generic, 'retirement')).toStrictEqual({
      access: 'locked',
      reason: 'a retirement account is locked',
      until: 'until you’re eligible to withdraw',
      basis: { via: 'default', pack: 'generic', pack_version: 4, question: null, answer: null },
    });
  });

  it('gives an answer its outcome', () => {
    expect(resolveAccess(generic, 'property', 'home')).toStrictEqual({
      access: 'locked',
      reason: 'it’s your home',
      until: 'while you live in it',
      basis: {
        via: 'answer',
        pack: 'generic',
        pack_version: 4,
        question: 'property',
        answer: 'home',
      },
    });
  });

  it('is undecided for "not_sure", and when a question goes unanswered', () => {
    expect(resolveAccess(generic, 'property', 'not_sure')).toStrictEqual({
      access: 'undecided',
      basis: {
        via: 'undecided',
        pack: 'generic',
        pack_version: 4,
        question: 'property',
        answer: 'not_sure',
      },
    });
    expect(resolveAccess(generic, 'property')).toStrictEqual({
      access: 'undecided',
      basis: {
        via: 'undecided',
        pack: 'generic',
        pack_version: 4,
        question: 'property',
        answer: null,
      },
    });
  });

  it('overrides a default with an answer to the "other" question', () => {
    expect(resolveAccess(generic, 'cash', 'tied')).toStrictEqual({
      access: 'locked',
      reason: 'you said it’s tied up',
      basis: { via: 'answer', pack: 'generic', pack_version: 4, question: 'other', answer: 'tied' },
    });
    expect(resolveAccess(generic, 'vehicle', 'not_sure')).toMatchObject({
      access: 'undecided',
      basis: { via: 'undecided', question: 'other', answer: 'not_sure' },
    });
  });

  it('reads the current pack, then generic, key by key', () => {
    // The country asks about retirement, where generic has a default: the country wins.
    expect(resolveAccess(country, 'retirement')).toStrictEqual({
      access: 'undecided',
      basis: {
        via: 'undecided',
        pack: 'qz',
        pack_version: 2,
        question: 'retirement',
        answer: null,
      },
    });
    expect(resolveAccess(country, 'retirement', 'reached')).toMatchObject({
      access: 'accessible',
      reason: 'you can withdraw it',
      basis: { via: 'answer', pack: 'qz', pack_version: 2, question: 'retirement' },
    });
    // The country's default for wrapper; generic's for cash and its question for property.
    expect(resolveAccess(country, 'wrapper')).toMatchObject({
      access: 'locked',
      basis: { via: 'default', pack: 'qz', pack_version: 2 },
    });
    expect(resolveAccess(country, 'cash').basis.pack).toBe('generic');
    expect(resolveAccess(country, 'property', 'let').basis).toMatchObject({
      pack: 'generic',
      question: 'property',
    });
  });

  it('asks the "other" question for a type with no default and no question', () => {
    expect(resolveAccess(generic, 'equity')).toMatchObject({
      access: 'undecided',
      basis: { question: 'other', answer: null },
    });
    expect(resolveAccess(generic, 'equity', 'sell')).toMatchObject({ access: 'illiquid' });
  });

  it('rejects an id that does not answer the question', () => {
    expect(() => resolveAccess(generic, 'property', 'now')).toThrow(
      '"now" does not answer "Do you live in it?". Use one of "home", "let", "not_sure".',
    );
    expect(() => resolveAccess(country, 'retirement', 'tied')).toThrow(RangeError);
  });

  it('needs an "other" question in the chain', () => {
    expect(() => resolveAccess([{ ...GENERIC, questions: {} }], 'equity')).toThrow(
      'The pack chain has no "other" question',
    );
  });
});

describe('accessRule', () => {
  it('gives a default and the question that overrides it', () => {
    expect(accessRule(generic, 'vehicle')).toStrictEqual({
      default: { access: 'illiquid', reason: 'you’d have to sell it first' },
      questionKey: 'other',
      question: GENERIC.questions.other,
    });
  });

  it("gives a type's own question, and no default", () => {
    expect(accessRule(country, 'retirement')).toStrictEqual({
      default: null,
      questionKey: 'retirement',
      question: COUNTRY.questions.retirement,
    });
    expect(accessRule(generic, 'crypto')).toMatchObject({ default: null, questionKey: 'other' });
  });
});

describe('accessBucket', () => {
  it('maps accessibility to the totals: undecided never counts as could use', () => {
    expect(accessBucket({ kind: 'asset', access: 'accessible' })).toBe('could_use');
    expect(accessBucket({ kind: 'asset', access: 'illiquid' })).toBe('sell_first');
    expect(accessBucket({ kind: 'asset', access: 'locked' })).toBe('locked');
    expect(accessBucket({ kind: 'asset', access: 'undecided' })).toBe('undecided');
    expect(accessBucket({ kind: 'asset', access: null })).toBe('undecided');
    expect(accessBucket({ kind: 'liability', access: null })).toBe('owed');
  });
});
