import { describe, expect, it } from 'vitest';
import countriesJson from '../../../content/countries.json' with { type: 'json' };
import householdJson from '../../../content/demo/household.json' with { type: 'json' };
import genericJson from '../../../content/packs/generic.json' with { type: 'json' };
import sgJson from '../../../content/packs/sg.json' with { type: 'json' };
import {
  demoHouseholdSchema,
  validateDemoHousehold,
  type ContentDoc,
  type DemoHousehold,
} from './content';

/**
 * The demo household's schema and its rules against the content it is loaded with (architecture
 * §6.5). The example is fictional (CONVENTIONS §6).
 */

const DOC = 'demo/household.json';

/** The content the household is checked against: the repository's packs and country list. */
const CONTENT: ContentDoc[] = [
  { kind: 'pack', doc: 'packs/generic.json', body: genericJson },
  { kind: 'pack', doc: 'packs/sg.json', body: sgJson },
  { kind: 'countries', doc: 'countries.json', body: countriesJson },
];

/** A small valid household: one account at home, one abroad, a loan of the SG pack's type. */
function example(): DemoHousehold {
  return {
    country: 'SG',
    baseCurrency: 'SGD',
    segment: 'established',
    endDate: '2026-09-30',
    tags: ['Joint'],
    holdings: [
      {
        name: 'Fictional savings',
        kind: 'asset',
        universal: 'cash',
        currency: 'SGD',
        tags: ['Joint'],
        values: [
          { date: '2026-08-31', amount: '1200.50' },
          { date: '2026-09-30', amount: '1300' },
        ],
      },
      {
        name: 'Fictional account abroad',
        kind: 'asset',
        universal: 'listed',
        currency: 'USD',
        values: [{ date: '2026-09-30', amount: '500.25', fxRate: '1.2841' }],
      },
      {
        name: 'Fictional car loan',
        kind: 'liability',
        universal: 'loan',
        packType: 'car_loan',
        currency: 'SGD',
        values: [{ date: '2026-09-30', amount: '9000' }],
      },
      {
        name: 'Fictional heirloom',
        kind: 'asset',
        universal: 'other',
        currency: 'SGD',
        access: 'not_sure',
        archived: true,
        values: [],
      },
    ],
  };
}

const check = (body: unknown) => validateDemoHousehold(DOC, body, CONTENT);

/** `example()` edited by `edit`, checked. */
function checkEdited(edit: (h: DemoHousehold) => void) {
  const household = example();
  edit(household);
  return check(household);
}

const holding = (h: DemoHousehold, i: number) => {
  const found = h.holdings[i];
  if (!found) throw new Error(`no holding ${i}`);
  return found;
};

describe('the demo household', () => {
  it('in content/ is valid against the repository’s packs and country list', () => {
    expect(check(householdJson)).toStrictEqual([]);
  });

  it('accepts a valid example', () => {
    expect(demoHouseholdSchema.safeParse(example()).success).toBe(true);
    expect(check(example())).toStrictEqual([]);
  });

  it('rejects an unknown universal type', () => {
    const errors = check({
      ...example(),
      holdings: [{ ...holding(example(), 0), universal: 'savings' }],
    });
    expect(errors).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[0].universal',
        message: expect.stringContaining('Use one of the universal types: cash, listed') as string,
      },
    ]);
  });

  it('rejects a value in another currency with no given rate', () => {
    const errors = checkEdited((h) => {
      const [value] = holding(h, 1).values;
      if (value) delete value.fxRate;
    });
    expect(errors).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[1].values[0].fxRate',
        message:
          'The holding is in USD, not SGD: give the rate into SGD, so no published rate is looked up.',
      },
    ]);
  });

  it('rejects a value dated after the end date', () => {
    const errors = checkEdited((h) => {
      holding(h, 0).values.push({ date: '2026-10-01', amount: '1' });
    });
    expect(errors).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[0].values[2].date',
        message: '2026-10-01 is after the end date, 2026-09-30: date it on or before it.',
      },
    ]);
  });

  it('rejects a rate on a value in the base currency', () => {
    const errors = checkEdited((h) => {
      const [value] = holding(h, 0).values;
      if (value) value.fxRate = '1.1';
    });
    expect(errors.map((e) => e.path)).toStrictEqual(['holdings[0].values[0].fxRate']);
  });

  it('rejects values out of date order, or two on one date', () => {
    const errors = checkEdited((h) => {
      holding(h, 0).values.reverse();
      holding(h, 1).values.push({ date: '2026-09-30', amount: '1', fxRate: '1.2' });
    });
    expect(errors.map((e) => e.path)).toStrictEqual([
      'holdings[0].values[1].date',
      'holdings[1].values[1].date',
    ]);
  });

  it('rejects more decimals than the currency has', () => {
    const errors = checkEdited((h) => {
      const [value] = holding(h, 0).values;
      if (value) value.amount = '1.005';
    });
    expect(errors).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[0].values[0].amount',
        message: 'SGD has 2 decimal places: give at most that many.',
      },
    ]);
  });

  it('rejects an amount, date or rate in the wrong form', () => {
    const errors = checkEdited((h) => {
      holding(h, 1).values = [{ date: '2026-02-30', amount: '-5', fxRate: '0' }];
    });
    expect(errors.map((e) => e.path)).toStrictEqual([
      'holdings[1].values[0].date',
      'holdings[1].values[0].amount',
      'holdings[1].values[0].fxRate',
    ]);
  });

  it('rejects a tag the household does not list, and repeated tags or names', () => {
    const errors = checkEdited((h) => {
      h.tags.push('joint');
      holding(h, 0).tags = ['Joint', 'Joint', 'Travel'];
      holding(h, 1).name = 'fictional SAVINGS';
    });
    expect(errors.map((e) => e.path)).toStrictEqual([
      'tags[1]',
      'holdings[0].tags[1]',
      'holdings[0].tags[2]',
      'holdings[1].name',
    ]);
  });

  it('rejects an accessibility answer on a liability', () => {
    const errors = checkEdited((h) => {
      holding(h, 2).access = 'yes';
    });
    expect(errors).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[2].access',
        message: 'A liability has no accessibility: leave access out.',
      },
    ]);
  });

  it('rejects an unknown field, segment or currency', () => {
    const errors = check({ ...example(), segment: 'unknown', baseCurrency: 'XYZ', note: 'x' });
    expect(errors.map((e) => e.path).sort()).toStrictEqual(['', 'baseCurrency', 'segment']);
  });

  it('rejects a country missing from the country list', () => {
    expect(checkEdited((h) => (h.country = 'QZ'))).toStrictEqual([
      { doc: DOC, path: 'country', message: 'There is no country "QZ" in the country list.' },
    ]);
  });

  it('rejects a base currency that is not the country’s', () => {
    const errors = checkEdited((h) => {
      h.baseCurrency = 'USD';
      holding(h, 0).values = [];
      holding(h, 1).values = [];
      holding(h, 2).values = [];
    });
    expect(errors.map((e) => e.path)).toStrictEqual(['baseCurrency']);
  });

  it('rejects a pack type the country’s packs do not have, or of another universal type', () => {
    expect(checkEdited((h) => (holding(h, 2).packType = 'boat_loan'))).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[2].packType',
        message:
          'There is no type "boat_loan" in SG\'s packs. Leave packType out for the plain type.',
      },
    ]);
    expect(checkEdited((h) => (holding(h, 2).universal = 'mortgage'))).toStrictEqual([
      {
        doc: DOC,
        path: 'holdings[2].universal',
        message:
          'Type "car_loan" is a loan, so the holding\'s universal is "loan", not "mortgage".',
      },
    ]);
  });
});
