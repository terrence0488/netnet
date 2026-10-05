import { z } from 'zod';
import { universalSchema } from '../content';
import { HOLDING_KINDS } from '../figures';
import {
  mcpAmount,
  mcpCurrency,
  mcpDate,
  mcpFxRate,
  mcpHoldingSchema,
  mcpId,
  mcpName,
  mcpTagIds,
  mcpWriteOutput,
} from './shared';
import { accessAnswerSchema } from '../ledger';

/** `create_holding`: a likely duplicate returns `LIKELY_DUPLICATE` unless allowed. */
export const createHoldingInputSchema = z
  .strictObject({
    name: mcpName,
    kind: z.enum(HOLDING_KINDS, { error: 'Use "asset" or "liability".' }),
    type_id: mcpId.optional(),
    universal_type: universalSchema.optional(),
    currency: mcpCurrency,
    tag_ids: mcpTagIds.optional(),
    /** An answer id from the question for the holding's type, or `"not_sure"`. */
    access_answer: accessAnswerSchema.optional(),
    /** A first value, written with it, in the holding's currency. */
    opening_value: z
      .strictObject({ amount: mcpAmount, date: mcpDate.optional(), fx_rate: mcpFxRate.optional() })
      .optional(),
    /** Create it even though it looks like an existing holding (`LIKELY_DUPLICATE`). */
    allow_duplicate: z.boolean().optional(),
  })
  .refine((h) => (h.type_id === undefined) !== (h.universal_type === undefined), {
    path: ['type_id'],
    message: 'Give type_id, or universal_type for your type of that universal type, but not both.',
  });
export type McpCreateHoldingInput = z.infer<typeof createHoldingInputSchema>;

export const createHoldingOutputSchema = mcpWriteOutput(mcpHoldingSchema);
export type McpCreateHoldingOutput = z.infer<typeof createHoldingOutputSchema>;
