import { z } from 'zod';
import { mcpId, mcpWriteOutput } from './shared';

/** `delete_holding`. */
export const deleteHoldingInputSchema = z.strictObject({ holding_id: mcpId });
export type McpDeleteHoldingInput = z.infer<typeof deleteHoldingInputSchema>;

export const deleteHoldingOutputSchema = mcpWriteOutput(z.null());
export type McpDeleteHoldingOutput = z.infer<typeof deleteHoldingOutputSchema>;
