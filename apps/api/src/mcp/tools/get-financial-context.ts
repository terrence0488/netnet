import {
  getFinancialContextInputSchema,
  getFinancialContextOutputSchema,
  type McpGetFinancialContextInput,
  type McpGetFinancialContextOutput,
} from '@netnet/contracts';
import { compileContext } from '@netnet/core';
import type { ToolCtx } from '../context';
import type { ToolDef } from '../tool';

/**
 * `get_financial_context`: `Ledger.context()` → `core.compileContext` with the pack chain and
 * the user's today — one call enough to answer (architecture §7.5, PRD J8).
 */
export const getFinancialContextTool: ToolDef<
  McpGetFinancialContextInput,
  McpGetFinancialContextOutput
> = {
  name: 'get_financial_context',
  title: 'Financial context',
  description:
    'The whole picture in one call: totals, what could be used, the period change, currency ' +
    'exposure, per-holding values with staleness, and which figure answers which question. ' +
    'Call this first for any question about the position.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getFinancialContextInputSchema,
  outputSchema: getFinancialContextOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const data = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.context());
    const chain = await ctx.options.content.chain();
    const names = new Map<string, string>();
    for (const id of ['claude', 'chatgpt'] as const) {
      const name = await ctx.guideNameFor(id);
      if (name !== undefined) names.set(id, name);
    }
    return compileContext(
      {
        ...data,
        connections: data.connections.map((c) => {
          const guideName = names.get(c.client);
          return guideName === undefined ? c : { ...c, guideName };
        }),
      },
      chain,
      ctx.today,
      input.baseline === undefined ? {} : { baseline: input.baseline },
    );
  },
  text: (output) =>
    `Context for ${output.picture.holdings} holdings as of ${output.as_of} (${output.currency}).`,
};
