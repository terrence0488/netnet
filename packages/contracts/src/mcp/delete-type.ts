import { z } from 'zod';
import { mcpId, mcpWriteOutput } from './shared';

/** `delete_type`: merge is a delete with `move_holdings_to`; holdings follow, nothing orphaned. */
export const deleteTypeInputSchema = z.strictObject({
  type_id: mcpId,
  move_holdings_to: mcpId.optional(),
});
export type McpDeleteTypeInput = z.infer<typeof deleteTypeInputSchema>;

export const deleteTypeOutputSchema = mcpWriteOutput(z.null());
export type McpDeleteTypeOutput = z.infer<typeof deleteTypeOutputSchema>;
