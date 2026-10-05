import {
  deleteHoldingInputSchema,
  deleteHoldingOutputSchema,
  type McpDeleteHoldingInput,
  type McpDeleteHoldingOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `delete_holding`: stops tracking a holding, with all its values. */
export const deleteHoldingTool: ToolDef<McpDeleteHoldingInput, McpDeleteHoldingOutput> = {
  name: 'delete_holding',
  title: 'Delete holding',
  description: 'Stop tracking a holding, with all its values.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: deleteHoldingInputSchema,
  outputSchema: deleteHoldingOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const write = await ctx.ledger(
      ctx.userId,
      ctx.actor,
      (l) => l.deleteHolding(input.holding_id),
      {
        write: true,
      },
    );
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, null);
  },
  text: () => 'Deleted the holding.',
};
