import { describe, expect, it } from 'vitest';
import { tokens } from './index';

describe('tokens', () => {
  it('exports the token object', () => {
    expect(tokens).toBeTypeOf('object');
  });
});
