import { describe, expect, it } from 'vitest';
import {
  ACCESS_BUCKETS,
  BASELINES,
  GROUP_BYS,
  HOLDING_KINDS,
  INTERVALS,
  NOT_SURE,
  PERIOD_VIEWS,
  VALUE_SOURCES,
} from './figures';

describe('figure vocabularies', () => {
  it('match architecture §6.3, §7.4 and §7.5 and PRD J4', () => {
    expect(HOLDING_KINDS).toStrictEqual(['asset', 'liability']);
    expect(VALUE_SOURCES).toStrictEqual(['web', 'agent', 'system']);
    expect(INTERVALS).toStrictEqual(['day', 'month', 'quarter', 'year']);
    expect(PERIOD_VIEWS).toStrictEqual(['monthly', 'quarterly', 'yearly']);
    expect(GROUP_BYS).toStrictEqual(['none', 'type', 'access', 'currency']);
    expect(BASELINES).toStrictEqual([
      'initial',
      'last_update',
      'last_month',
      'last_quarter',
      'year_start',
      'last_year',
    ]);
    expect(ACCESS_BUCKETS).toStrictEqual([
      'could_use',
      'sell_first',
      'locked',
      'undecided',
      'owed',
    ]);
    expect(NOT_SURE).toBe('not_sure');
  });
});
