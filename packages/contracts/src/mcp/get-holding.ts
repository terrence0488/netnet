import { z } from 'zod';
import { mcpCursor, mcpHoldingViewSchema, mcpId, mcpValueSchema, mcpValuesLimit } from './shared';

/** `get_holding`: a holding with a page of its values, newest first, with provenance. */
export const getHoldingInputSchema = z.strictObject({
  holding_id: mcpId,
  values_cursor: mcpCursor.optional(),
  values_limit: mcpValuesLimit,
});
export type McpGetHoldingInput = z.infer<typeof getHoldingInputSchema>;

export const getHoldingOutputSchema = mcpHoldingViewSchema.extend({
  values: z.strictObject({
    items: z.array(mcpValueSchema),
    /** Pass as `values_cursor` for the next page; null on the last. */
    next_cursor: z.string().nullable(),
  }),
});
export type McpGetHoldingOutput = z.infer<typeof getHoldingOutputSchema>;
