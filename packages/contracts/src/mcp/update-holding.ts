import { z } from 'zod';
import {
  mcpCadenceDays,
  mcpHoldingSchema,
  mcpId,
  mcpName,
  mcpTagIds,
  mcpWriteOutput,
} from './shared';
import { accessAnswerSchema } from '../ledger';

/**
 * `update_holding`. `access_answer: null` goes back to the type's default; `cadence_days: null`
 * follows the pack again; `archived` archives or unarchives.
 */
export const updateHoldingInputSchema = z.strictObject({
  holding_id: mcpId,
  name: mcpName.optional(),
  type_id: mcpId.optional(),
  tag_ids: mcpTagIds.optional(),
  access_answer: accessAnswerSchema.nullable().optional(),
  cadence_days: mcpCadenceDays,
  archived: z.boolean().optional(),
});
export type McpUpdateHoldingInput = z.infer<typeof updateHoldingInputSchema>;

export const updateHoldingOutputSchema = mcpWriteOutput(mcpHoldingSchema);
export type McpUpdateHoldingOutput = z.infer<typeof updateHoldingOutputSchema>;
