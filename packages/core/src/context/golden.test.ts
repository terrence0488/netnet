import type { ContextInput, FinancialContext } from '@netnet/contracts';
import { financialContextSchema } from '@netnet/contracts';
import { describe, expect, it } from 'vitest';
import { compileContext } from './compile-context';
import { utf8Length } from './size';
import { ABROAD, CHAIN, EMPTY, ESTABLISHED, LARGE, STARTING_OUT, TODAY } from './test-accounts';

/**
 * The golden files are compileContext's contract (CONVENTIONS §9, architecture §7.5): for fixed
 * input, the output is pinned byte for byte. A change to any of them is a change to what every
 * agent reads, so it is reviewed as one. They are written by `vitest -u` and never by hand.
 */

const ACCOUNTS: [string, ContextInput][] = [
  ['empty-account', EMPTY],
  ['starting-out', STARTING_OUT],
  ['established', ESTABLISHED],
  ['two-hundred-holdings', LARGE],
  ['holdings-from-abroad', ABROAD],
];

const compile = (data: ContextInput) => compileContext(data, CHAIN, TODAY, {});
/** The golden form: the same JSON as the wire's, indented so a diff reads. */
const golden = (ctx: FinancialContext) => `${JSON.stringify(ctx, null, 2)}\n`;

describe.each(ACCOUNTS)('the %s context', (name, data) => {
  const ctx = compile(data);

  it('matches its golden file byte for byte', async () => {
    await expect(golden(ctx)).toMatchFileSnapshot(`./golden/${name}.json`);
  });

  it('is the same bytes on every run, whatever order the input arrives in', () => {
    const reversed: ContextInput = {
      ...data,
      holdings: [...data.holdings].reverse(),
      values: [...data.values].reverse(),
      types: [...data.types].reverse(),
      tags: [...data.tags].reverse(),
      connections: [...data.connections].reverse(),
    };
    expect(JSON.stringify(compile(data))).toBe(JSON.stringify(ctx));
    expect(JSON.stringify(compile(reversed))).toBe(JSON.stringify(ctx));
  });

  it('is at most 8 KB of JSON', () => {
    expect(utf8Length(JSON.stringify(ctx))).toBeLessThanOrEqual(8192);
  });

  it("validates against get_financial_context's output schema, keys in its order", () => {
    // The schema rebuilds each object in its own key order, so equal JSON means equal order.
    expect(JSON.stringify(financialContextSchema.parse(ctx))).toBe(JSON.stringify(ctx));
  });
});
