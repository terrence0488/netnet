import { z } from 'zod';
import {
  mcpAmount,
  mcpCurrency,
  mcpDate,
  mcpFxRate,
  mcpId,
  mcpValueSchema,
  mcpWriteOutput,
} from './shared';

/** `update_value`. `fx_rate: null` drops a given rate. */
export const updateValueInputSchema = z.strictObject({
  value_id: mcpId,
  amount: mcpAmount.optional(),
  date: mcpDate.optional(),
  currency: mcpCurrency.optional(),
  fx_rate: mcpFxRate.nullable().optional(),
});
export type McpUpdateValueInput = z.infer<typeof updateValueInputSchema>;

export const updateValueOutputSchema = mcpWriteOutput(mcpValueSchema);
export type McpUpdateValueOutput = z.infer<typeof updateValueOutputSchema>;
