import { describe, expect, it } from 'vitest';
import { assertNever } from './index';

describe('assertNever', () => {
  it('throws when an impossible value arrives at run time', () => {
    expect(() => assertNever('stray' as never)).toThrow('Unexpected value: "stray"');
  });
});
