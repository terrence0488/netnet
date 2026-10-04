import { describe, expect, it } from 'vitest';
import * as core from './index';
import { assertNever } from './index';

describe('assertNever', () => {
  it('throws when an impossible value arrives at run time', () => {
    expect(() => assertNever('stray' as never)).toThrow('Unexpected value: "stray"');
  });
});

describe('the public API', () => {
  it("exports architecture §7.9's figure functions", () => {
    for (const name of [
      'toMinor',
      'fromMinor',
      'convert',
      'resolveAccess',
      'latestValues',
      'position',
      'series',
      'baselineChange',
      'staleness',
      'likelyDuplicates',
      'packChain',
      'typeLabel',
    ]) {
      expect(typeof core[name as keyof typeof core], name).toBe('function');
    }
  });
});
