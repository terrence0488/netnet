import {
  updateHoldingInputSchema,
  updateHoldingOutputSchema,
  type HoldingPatch,
  type McpUpdateHoldingInput,
  type McpUpdateHoldingOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { holdingToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `update_holding`: rename, retype, retag, or change accessibility, cadence, archived. */
export const updateHoldingTool: ToolDef<McpUpdateHoldingInput, McpUpdateHoldingOutput> = {
  name: 'update_holding',
  title: 'Update holding',
  description:
    'Rename a holding, change its type, tags, accessibility answer, cadence or archived state.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: updateHoldingInputSchema,
  outputSchema: updateHoldingOutputSchema,
  renames: { access: 'access_answer' },
  run: async (ctx: ToolCtx, input) => {
    const patch: HoldingPatch = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.type_id === undefined ? {} : { typeId: input.type_id }),
      ...(input.tag_ids === undefined ? {} : { tagIds: [...input.tag_ids] }),
      ...(input.access_answer === undefined ? {} : { access: input.access_answer }),
      ...(input.cadence_days === undefined ? {} : { cadenceDays: input.cadence_days }),
      ...(input.archived === undefined ? {} : { archived: input.archived }),
    };
    const write = await ctx.ledger(
      ctx.userId,
      ctx.actor,
      (l) => l.updateHolding(input.holding_id, patch),
      {
        write: true,
      },
    );
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, holdingToMcp(write.result));
  },
  text: (output) => `Updated holding "${output.result.name}" (${output.result.id}).`,
};
