import {
  deleteValueInputSchema,
  deleteValueOutputSchema,
  type McpDeleteValueInput,
  type McpDeleteValueOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `delete_value`: deletes one value. */
export const deleteValueTool: ToolDef<McpDeleteValueInput, McpDeleteValueOutput> = {
  name: 'delete_value',
  title: 'Delete value',
  description: 'Delete one value.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: deleteValueInputSchema,
  outputSchema: deleteValueOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.deleteValue(input.value_id), {
      write: true,
    });
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, null);
  },
};
