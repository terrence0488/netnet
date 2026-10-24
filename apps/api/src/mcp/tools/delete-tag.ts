import {
  deleteTagInputSchema,
  deleteTagOutputSchema,
  type McpDeleteTagInput,
  type McpDeleteTagOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `delete_tag`: merge is a delete with `merge_into`; holdings follow, never refused. */
export const deleteTagTool: ToolDef<McpDeleteTagInput, McpDeleteTagOutput> = {
  name: 'delete_tag',
  title: 'Delete tag',
  description: 'Delete a tag. merge_into folds it into another tag instead.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: deleteTagInputSchema,
  outputSchema: deleteTagOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const write = await ctx.ledger(
      ctx.userId,
      ctx.actor,
      (l) => l.deleteTag(input.tag_id, input.merge_into),
      { write: true },
    );
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, null);
  },
};
