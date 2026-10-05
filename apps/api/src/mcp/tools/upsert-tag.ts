import {
  upsertTagInputSchema,
  upsertTagOutputSchema,
  type McpUpsertTagInput,
  type McpUpsertTagOutput,
  type TagInput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { tagToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `upsert_tag`: without `tag_id`, a new tag; with it, a rename. */
export const upsertTagTool: ToolDef<McpUpsertTagInput, McpUpsertTagOutput> = {
  name: 'upsert_tag',
  title: 'Upsert tag',
  description: 'Add a tag, or rename one.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: upsertTagInputSchema,
  outputSchema: upsertTagOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const tag: TagInput = {
      ...(input.tag_id === undefined ? {} : { id: input.tag_id }),
      name: input.name,
    };
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.upsertTag(tag), {
      write: true,
    });
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, tagToMcp(write.result));
  },
  text: (output) => `Saved tag "${output.result.name}" (${output.result.id}).`,
};
