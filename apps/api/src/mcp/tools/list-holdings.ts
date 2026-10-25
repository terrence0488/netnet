import {
  listHoldingsInputSchema,
  listHoldingsOutputSchema,
  type HoldingQuery,
  type McpListHoldingsInput,
  type McpListHoldingsOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { holdingViewToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `list_holdings`: holdings with latest value, as-of, staleness and access. */
export const listHoldingsTool: ToolDef<McpListHoldingsInput, McpListHoldingsOutput> = {
  name: 'list_holdings',
  title: 'List holdings',
  description:
    'Holdings with their latest value, how old it is, and how accessible each one is. ' +
    'Page through with cursor; filter by type, tag, or staleness.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: listHoldingsInputSchema,
  outputSchema: listHoldingsOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const query: HoldingQuery = {
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.type_ids === undefined ? {} : { typeIds: [...input.type_ids] }),
      ...(input.tag_ids === undefined ? {} : { tagIds: [...input.tag_ids] }),
      ...(input.archived === undefined ? {} : { archived: input.archived }),
      ...(input.stale_only === undefined ? {} : { staleOnly: input.stale_only }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    };
    const page = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.listHoldings(query));
    return { holdings: page.items.map(holdingViewToMcp), next_cursor: page.nextCursor };
  },
};
