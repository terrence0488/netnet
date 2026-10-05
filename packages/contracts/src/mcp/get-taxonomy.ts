import { z } from 'zod';
import { mcpTagSchema, mcpTypeSchema } from './shared';

/** `get_taxonomy`: the user's types (label, universal meaning) and tags. */
export const getTaxonomyInputSchema = z.strictObject({});
export type McpGetTaxonomyInput = z.infer<typeof getTaxonomyInputSchema>;

export const getTaxonomyOutputSchema = z.strictObject({
  types: z.array(mcpTypeSchema),
  tags: z.array(mcpTagSchema),
});
export type McpGetTaxonomyOutput = z.infer<typeof getTaxonomyOutputSchema>;
