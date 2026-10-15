import type { Countries } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { currencyOptions } from './currencies';

const COUNTRIES: Countries = {
  SG: { currency: 'SGD', pack: 'sg' },
  MY: { currency: 'MYR', pack: 'my' },
  DE: { currency: 'EUR' },
  FR: { currency: 'EUR' },
};

describe('currencyOptions', () => {
  it('lists every currency any known country uses, once, alphabetical', () => {
    expect(currencyOptions(COUNTRIES)).toStrictEqual(['EUR', 'MYR', 'SGD']);
  });
});
