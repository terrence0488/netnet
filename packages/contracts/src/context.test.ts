import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CONTEXT_ACCESSES,
  FRESHNESS,
  MAX_CONTEXT_BYTES,
  MAX_CONTEXT_HOLDINGS,
  MAX_CONTEXT_NOTES,
  financialContextSchema,
} from './context';

/** Architecture §7.5's example, in full, with fictional names. */
const holding = {
  id: 'hld_01J9ZK3M4N5P6Q7R8S9T0V1W2X',
  name: 'Workplace pension',
  type: 'Retirement account',
  tags: ['Joint'],
  access: 'locked',
  access_reason: 'a retirement account is locked',
  until: 'until you’re eligible to withdraw',
  value: {
    amount: 117100,
    currency: 'SGD',
    base: 117100,
    as_of: '2026-08-04',
    age_days: 54,
    stale: false,
    written_by: 'agent:Claude',
  },
  change: { amount: 1400, pct: 1.21 },
};

const example = {
  as_of: '2026-09-27',
  currency: 'SGD',
  answer_guide: [
    {
      for: 'affordability — can I pay for X from what I have',
      use: 'totals.could_use',
      never: 'totals.net_worth',
      note: 'sell_first, locked and undecided money is excluded',
    },
    { for: 'exposure and risk', use: 'exposure' },
  ],
  totals: {
    net_worth: 1840250,
    assets: 2310250,
    owed: 470000,
    could_use: 1040000,
    sell_first: 120000,
    locked: 1150250,
    undecided: 0,
    owed_to_could_use: 0.45,
    change: { baseline: 'last_month', since: '2026-08-31', amount: 12400, pct: 0.68 },
  },
  picture: {
    holdings: 12,
    stale: 1,
    undecided: 0,
    without_value: 0,
    oldest_value_days: 410,
    freshness: 'some_stale',
    notes: ['The value of “Car” is 410 days old', 'NetNet only knows what has been added'],
  },
  exposure: {
    by_currency: [
      { currency: 'SGD', share: 0.77 },
      { currency: 'USD', share: 0.23 },
    ],
    concentration: [{ holding_id: 'hld_01J9ZK3M4N5P6Q7R8S9T0V1W2Y', name: 'Flat', share: 0.41 }],
  },
  types: [
    {
      type: 'Retirement account',
      meaning:
        'A retirement account. Counts toward net worth, never toward what can be spent this month.',
    },
  ],
  holdings: [holding, { ...holding, id: 'hld_2', access: 'owed', value: null, change: null }],
  omitted: {
    holdings: 10,
    by_type: [{ type: 'Shares & funds', holdings: 10, assets: 1200.5, owed: 0 }],
    hint: 'list_holdings returns every holding',
  },
};

type Patch = (doc: typeof example) => unknown;

describe('financialContextSchema', () => {
  it('converts to JSON Schema, as get_financial_context’s outputSchema', () => {
    const schema = z.toJSONSchema(financialContextSchema);
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false });
    expect(Object.keys(schema.properties ?? {})).toHaveLength(9);
  });

  it('accepts architecture §7.5’s example', () => {
    expect(financialContextSchema.parse(example)).toStrictEqual(example);
  });

  it('gives its keys in §7.5’s order, whatever order they arrive in', () => {
    const reversed = Object.fromEntries(Object.entries(example).reverse());
    expect(Object.keys(financialContextSchema.parse(reversed))).toStrictEqual([
      'as_of',
      'currency',
      'answer_guide',
      'totals',
      'picture',
      'exposure',
      'types',
      'holdings',
      'omitted',
    ]);
  });

  it.each<[string, Patch]>([
    ['an unknown key', (d) => ({ ...d, advice: 'buy the car' })],
    [
      'a missing section',
      (d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'omitted')),
    ],
    ['a date in another form', (d) => ({ ...d, as_of: '27/09/2026' })],
    ['a currency in lower case', (d) => ({ ...d, currency: 'sgd' })],
    ['an amount as a string', (d) => ({ ...d, totals: { ...d.totals, net_worth: '1840250.00' } })],
    ['a negative count', (d) => ({ ...d, picture: { ...d.picture, stale: -1 } })],
    ['an unknown freshness', (d) => ({ ...d, picture: { ...d.picture, freshness: 'stale' } })],
    [
      'more than five notes',
      (d) => ({ ...d, picture: { ...d.picture, notes: Array<string>(6).fill('A fact') } }),
    ],
    [
      'more than 25 holdings',
      (d) => ({ ...d, holdings: Array.from({ length: 26 }, () => holding) }),
    ],
    ['an unknown access', (d) => ({ ...d, holdings: [{ ...holding, access: 'spendable' }] })],
    [
      'a meaning on a holding instead of in types',
      (d) => ({ ...d, holdings: [{ ...holding, meaning: 'A retirement account.' }] }),
    ],
    ['a type without its meaning', (d) => ({ ...d, types: [{ type: 'Retirement account' }] })],
    [
      'a writer that is not web, system or an agent',
      (d) => ({
        ...d,
        holdings: [{ ...holding, value: { ...holding.value, written_by: 'Claude' } }],
      }),
    ],
    [
      'an empty agent name',
      (d) => ({
        ...d,
        holdings: [{ ...holding, value: { ...holding.value, written_by: 'agent:' } }],
      }),
    ],
    [
      'an answer guide entry with an explicit undefined',
      (d) => ({
        ...d,
        answer_guide: [{ for: 'debt burden', use: 'totals.owed', note: undefined }],
      }),
    ],
    [
      'an unknown baseline',
      (d) => ({
        ...d,
        totals: { ...d.totals, change: { ...d.totals.change, baseline: 'last_week' } },
      }),
    ],
    [
      'an empty type in the summary',
      (d) => ({
        ...d,
        omitted: { ...d.omitted, by_type: [{ type: 'X', holdings: 0, assets: 0, owed: 0 }] },
      }),
    ],
  ])('rejects %s', (_, patch) => {
    expect(financialContextSchema.safeParse(patch(example)).success).toBe(false);
  });
});

describe('context vocabularies and limits', () => {
  it('match architecture §7.5 and the brief', () => {
    expect(FRESHNESS).toStrictEqual(['empty', 'fresh', 'some_stale', 'mostly_stale']);
    expect(CONTEXT_ACCESSES).toStrictEqual([
      'accessible',
      'illiquid',
      'locked',
      'undecided',
      'owed',
    ]);
    expect([MAX_CONTEXT_BYTES, MAX_CONTEXT_HOLDINGS, MAX_CONTEXT_NOTES]).toStrictEqual([
      8192, 25, 5,
    ]);
  });
});
