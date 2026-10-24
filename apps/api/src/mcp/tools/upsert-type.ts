import {
  upsertTypeInputSchema,
  upsertTypeOutputSchema,
  type McpUpsertTypeInput,
  type McpUpsertTypeOutput,
  type TypeInput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { userTypeToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `upsert_type`: without `type_id`, a new type of `universal_type`; with it, a rename. */
export const upsertTypeTool: ToolDef<McpUpsertTypeInput, McpUpsertTypeOutput> = {
  name: 'upsert_type',
  title: 'Upsert type',
  description:
    'Add a type of holding, or rename one. A new type needs the universal type it means.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: upsertTypeInputSchema,
  outputSchema: upsertTypeOutputSchema,
  renames: { universal: 'universal_type' },
  run: async (ctx: ToolCtx, input) => {
    const type: TypeInput = {
      ...(input.type_id === undefined ? {} : { id: input.type_id }),
      name: input.name,
      ...(input.universal_type === undefined ? {} : { universal: input.universal_type }),
    };
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.upsertType(type), {
      write: true,
    });
    trackWriteEvents(ctx, write.events);
    const chain = await ctx.options.content.chain();
    return writeToMcp(write, userTypeToMcp(write.result, chain));
  },
};
