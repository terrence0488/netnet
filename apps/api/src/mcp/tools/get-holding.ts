import {
  getHoldingInputSchema,
  getHoldingOutputSchema,
  type McpGetHoldingInput,
  type McpGetHoldingOutput,
  type PageReq,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { holdingViewToMcp, valueToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `get_holding`: a holding with a page of its values, newest first, with provenance. */
export const getHoldingTool: ToolDef<McpGetHoldingInput, McpGetHoldingOutput> = {
  name: 'get_holding',
  title: 'Get holding',
  description: 'One holding with a page of its values, newest first, each with its provenance.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getHoldingInputSchema,
  outputSchema: getHoldingOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const page: PageReq = {
      ...(input.values_cursor === undefined ? {} : { cursor: input.values_cursor }),
      ...(input.values_limit === undefined ? {} : { limit: input.values_limit }),
    };
    const detail = await ctx.ledger(ctx.userId, ctx.actor, (l) =>
      l.getHolding(input.holding_id, page),
    );
    return {
      ...holdingViewToMcp(detail),
      values: {
        items: detail.values.items.map(valueToMcp),
        next_cursor: detail.values.nextCursor,
      },
    };
  },
};
