import { z } from 'zod';
import { financialContextSchema } from '../context';
import { BASELINES } from '../figures';

/** `get_financial_context`: one call enough to answer (architecture §7.5). */
export const getFinancialContextInputSchema = z.strictObject({
  baseline: z.enum(BASELINES).optional(),
});
export type McpGetFinancialContextInput = z.infer<typeof getFinancialContextInputSchema>;

/** P1-T9's `FinancialContext`. */
export const getFinancialContextOutputSchema = financialContextSchema;
export type McpGetFinancialContextOutput = z.infer<typeof getFinancialContextOutputSchema>;
