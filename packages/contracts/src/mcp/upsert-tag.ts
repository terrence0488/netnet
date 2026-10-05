import { z } from 'zod';
import { mcpId, mcpName, mcpTagSchema, mcpWriteOutput } from './shared';

/** `upsert_tag`: without `tag_id`, a new tag; with it, a rename. */
export const upsertTagInputSchema = z.strictObject({ tag_id: mcpId.optional(), name: mcpName });
export type McpUpsertTagInput = z.infer<typeof upsertTagInputSchema>;

export const upsertTagOutputSchema = mcpWriteOutput(mcpTagSchema);
export type McpUpsertTagOutput = z.infer<typeof upsertTagOutputSchema>;
