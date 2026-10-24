import {
  createHoldingInputSchema,
  createHoldingOutputSchema,
  type CreateHolding,
  type McpCreateHoldingInput,
  type McpCreateHoldingOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { holdingToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `create_holding`: a likely duplicate returns `LIKELY_DUPLICATE` unless allowed. */
export const createHoldingTool: ToolDef<McpCreateHoldingInput, McpCreateHoldingOutput> = {
  name: 'create_holding',
  title: 'Create holding',
  description:
    'Track a new holding. Look for an existing one first: unless allow_duplicate is true, ' +
    'a likely match is returned instead of created. access_answer is an answer id from ' +
    'get_setup_guide, or "not_sure".',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: createHoldingInputSchema,
  outputSchema: createHoldingOutputSchema,
  renames: { access: 'access_answer', opening: 'opening_value', universal: 'universal_type' },
  run: async (ctx: ToolCtx, input) => {
    const create: CreateHolding = {
      name: input.name,
      kind: input.kind,
      ...(input.type_id === undefined ? {} : { typeId: input.type_id }),
      ...(input.universal_type === undefined ? {} : { universal: input.universal_type }),
      currency: input.currency,
      ...(input.tag_ids === undefined ? {} : { tagIds: [...input.tag_ids] }),
      ...(input.access_answer === undefined ? {} : { access: input.access_answer }),
      ...(input.opening_value === undefined
        ? {}
        : {
            opening: {
              amount: input.opening_value.amount,
              ...(input.opening_value.date === undefined ? {} : { date: input.opening_value.date }),
              ...(input.opening_value.fx_rate === undefined
                ? {}
                : { fxRate: input.opening_value.fx_rate }),
            },
          }),
      ...(input.allow_duplicate === undefined ? {} : { allowDuplicate: input.allow_duplicate }),
    };
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.createHolding(create), {
      write: true,
    });
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, holdingToMcp(write.result));
  },
};
