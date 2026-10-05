import { z } from 'zod';
import { mcpId, mcpWriteOutput } from './shared';

/** `delete_value`. */
export const deleteValueInputSchema = z.strictObject({ value_id: mcpId });
export type McpDeleteValueInput = z.infer<typeof deleteValueInputSchema>;

export const deleteValueOutputSchema = mcpWriteOutput(z.null());
export type McpDeleteValueOutput = z.infer<typeof deleteValueOutputSchema>;
