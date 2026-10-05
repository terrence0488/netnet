import {
  updateValueInputSchema,
  updateValueOutputSchema,
  type McpUpdateValueInput,
  type McpUpdateValueOutput,
  type ValuePatch,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { valueToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `update_value`: corrects a value's amount, date, currency or rate. */
export const updateValueTool: ToolDef<McpUpdateValueInput, McpUpdateValueOutput> = {
  name: 'update_value',
  title: 'Update value',
  description: 'Correct a value: its amount, date, currency or the rate it was converted at.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: updateValueInputSchema,
  outputSchema: updateValueOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const patch: ValuePatch = {
      ...(input.amount === undefined ? {} : { amount: input.amount }),
      ...(input.date === undefined ? {} : { date: input.date }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.fx_rate === undefined ? {} : { fxRate: input.fx_rate }),
    };
    const write = await ctx.ledger(
      ctx.userId,
      ctx.actor,
      (l) => l.updateValue(input.value_id, patch),
      {
        write: true,
      },
    );
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, valueToMcp(write.result));
  },
  text: (output) => `Updated the value of ${output.result.date} (${output.result.id}).`,
};
