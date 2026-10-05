import { z } from 'zod';
import { mcpId, mcpWriteOutput } from './shared';

/** `delete_tag`: merge is a delete with `merge_into`; holdings follow, never refused. */
export const deleteTagInputSchema = z.strictObject({
  tag_id: mcpId,
  merge_into: mcpId.optional(),
});
export type McpDeleteTagInput = z.infer<typeof deleteTagInputSchema>;

export const deleteTagOutputSchema = mcpWriteOutput(z.null());
export type McpDeleteTagOutput = z.infer<typeof deleteTagOutputSchema>;
