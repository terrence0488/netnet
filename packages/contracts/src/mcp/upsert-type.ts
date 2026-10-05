import { z } from 'zod';
import { universalSchema } from '../content';
import { mcpId, mcpName, mcpTypeSchema, mcpWriteOutput } from './shared';

/** `upsert_type`: without `type_id`, a new type of `universal_type`; with it, a rename. */
export const upsertTypeInputSchema = z
  .strictObject({
    type_id: mcpId.optional(),
    name: mcpName,
    universal_type: universalSchema.optional(),
  })
  .refine((t) => t.type_id !== undefined || t.universal_type !== undefined, {
    path: ['universal_type'],
    message: 'Give the universal type a new type means, such as "cash".',
  });
export type McpUpsertTypeInput = z.infer<typeof upsertTypeInputSchema>;

export const upsertTypeOutputSchema = mcpWriteOutput(mcpTypeSchema);
export type McpUpsertTypeOutput = z.infer<typeof upsertTypeOutputSchema>;
