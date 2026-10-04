import type { HoldingIn, Universal, ValueIn, VersionedPack } from '@netnet/contracts';

/**
 * Fictional test data for core's tests: a generic pack and a pack for an imaginary country
 * ("qz"), with every amount invented. Nothing here is imported outside tests.
 */

const everyType = <T>(value: (u: Universal) => T): Record<Universal, T> => ({
  cash: value('cash'),
  listed: value('listed'),
  retirement: value('retirement'),
  property: value('property'),
  vehicle: value('vehicle'),
  equity: value('equity'),
  crypto: value('crypto'),
  mortgage: value('mortgage'),
  loan: value('loan'),
  wrapper: value('wrapper'),
  card: value('card'),
  other: value('other'),
});

export const GENERIC: VersionedPack = {
  id: 'generic',
  version: 4,
  locale: null,
  currency: null,
  labels: { ...everyType((u) => `Label ${u}`), cash: 'Cash & savings' },
  examples: {},
  meaning: everyType((u) => `Meaning of ${u}.`),
  cadenceDays: { ...everyType(() => 90), cash: 30, property: 365 },
  defaults: {
    cash: { access: 'accessible', reason: 'it’s money in the bank' },
    retirement: {
      access: 'locked',
      reason: 'a retirement account is locked',
      until: 'until you’re eligible to withdraw',
    },
    vehicle: { access: 'illiquid', reason: 'you’d have to sell it first' },
  },
  questions: {
    property: {
      ask: 'Do you live in it?',
      answers: [
        {
          id: 'home',
          label: 'Yes',
          access: 'locked',
          reason: 'it’s your home',
          until: 'while you live in it',
        },
        { id: 'let', label: 'No', access: 'illiquid', reason: 'you’d have to sell it first' },
      ],
    },
    other: {
      ask: 'Could you use it within a month?',
      answers: [
        { id: 'now', label: 'Yes', access: 'accessible', reason: 'you said you could' },
        { id: 'sell', label: 'By selling it', access: 'illiquid', reason: 'you’d sell it first' },
        { id: 'tied', label: 'No', access: 'locked', reason: 'you said it’s tied up' },
      ],
    },
  },
  types: [],
  checklist: [],
};

/** An imaginary country's pack: only what differs from generic. */
export const COUNTRY: VersionedPack = {
  id: 'qz',
  version: 2,
  locale: 'en-GB',
  currency: 'EUR',
  labels: { cash: 'Current account' },
  examples: {},
  meaning: {},
  cadenceDays: { cash: 14 },
  defaults: { wrapper: { access: 'locked', reason: 'the scheme keeps it until you retire' } },
  questions: {
    retirement: {
      ask: 'Have you reached the withdrawal age?',
      answers: [
        { id: 'reached', label: 'Yes', access: 'accessible', reason: 'you can withdraw it' },
        {
          id: 'not_yet',
          label: 'Not yet',
          access: 'locked',
          reason: 'it’s locked until the withdrawal age',
          until: 'until the withdrawal age',
        },
      ],
    },
  },
  types: [{ key: 'auto_loan', u: 'loan', label: 'Auto loan' }],
  checklist: [],
};

export function holding(id: string, overrides: Partial<HoldingIn> = {}): HoldingIn {
  return {
    id,
    name: `Holding ${id}`,
    kind: 'asset',
    typeId: 'typ_cash',
    universal: 'cash',
    currency: 'EUR',
    cadenceDays: null,
    archived: false,
    access: 'accessible',
    tagIds: [],
    ...overrides,
  };
}

export function liability(id: string, overrides: Partial<HoldingIn> = {}): HoldingIn {
  return holding(id, {
    kind: 'liability',
    typeId: 'typ_loan',
    universal: 'loan',
    access: null,
    ...overrides,
  });
}

let sequence = 0;

/** A value in base currency (EUR); ids increase with each call, as ULIDs do. */
export function value(
  holdingId: string,
  date: string,
  baseMinor: number,
  overrides: Partial<ValueIn> = {},
): ValueIn {
  sequence += 1;
  return {
    id: `val_${String(sequence).padStart(6, '0')}`,
    holdingId,
    date,
    amountMinor: baseMinor,
    currency: 'EUR',
    baseMinor,
    source: 'web',
    clientName: null,
    ...overrides,
  };
}
