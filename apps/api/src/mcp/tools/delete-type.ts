import {
  deleteTypeInputSchema,
  deleteTypeOutputSchema,
  type McpDeleteTypeInput,
  type McpDeleteTypeOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `delete_type`: merge is a delete with `move_holdings_to`; holdings follow. */
export const deleteTypeTool: ToolDef<McpDeleteTypeInput, McpDeleteTypeOutput> = {
  name: 'delete_type',
  title: 'Delete type',
  description:
    'Delete a type. While holdings use it, move_holdings_to says which type they move to.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: deleteTypeInputSchema,
  outputSchema: deleteTypeOutputSchema,
  renames: { moveTo: 'move_holdings_to' },
  run: async (ctx: ToolCtx, input) => {
    const write = await ctx.ledger(
      ctx.userId,
      ctx.actor,
      (l) => l.deleteType(input.type_id, input.move_holdings_to),
      { write: true },
    );
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, null);
  },
  text: () => 'Deleted the type.',
};
