import {
  recordValuesInputSchema,
  recordValuesOutputSchema,
  type McpRecordValuesInput,
  type McpRecordValuesOutput,
  type NewValue,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { valueToMcp, warningToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `record_values`: 1 to 200 values, atomic — one bad item writes nothing. */
export const recordValuesTool: ToolDef<McpRecordValuesInput, McpRecordValuesOutput> = {
  name: 'record_values',
  title: 'Record values',
  description:
    'Record up to 200 values at once, across holdings. A value for a holding and date ' +
    'already stored is replaced. Atomic: one bad item writes nothing.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: recordValuesInputSchema,
  outputSchema: recordValuesOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const items: NewValue[] = input.values.map((v) => ({
      holdingId: v.holding_id,
      amount: v.amount,
      ...(v.date === undefined ? {} : { date: v.date }),
      ...(v.currency === undefined ? {} : { currency: v.currency }),
      ...(v.fx_rate === undefined ? {} : { fxRate: v.fx_rate }),
    }));
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.recordValues(items), {
      write: true,
    });
    trackWriteEvents(ctx, write.events);
    return {
      results: write.result.map((r) => ({
        value: valueToMcp(r.value),
        replaced: r.replaced,
        warnings: r.warnings.map(warningToMcp),
      })),
      data_version: write.dataVersion,
      warnings: write.warnings.map(warningToMcp),
    };
  },
};
