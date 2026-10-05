import { z } from 'zod';
import { MAX_VALUES_PER_CALL } from '../ledger';
import {
  mcpAmount,
  mcpCurrency,
  mcpDate,
  mcpFxRate,
  mcpId,
  mcpValueSchema,
  mcpWarningSchema,
} from './shared';

/** `record_values`: 1 to 200 values, atomic — one bad item writes nothing. */
export const recordValuesInputSchema = z.strictObject({
  values: z
    .array(
      z.strictObject({
        holding_id: mcpId,
        amount: mcpAmount,
        /** Defaults to the user's today; at most a day after it. */
        date: mcpDate.optional(),
        /** Defaults to the holding's currency. */
        currency: mcpCurrency.optional(),
        fx_rate: mcpFxRate.optional(),
      }),
      { error: 'Give a list of values.' },
    )
    .min(1, `Give 1 to ${MAX_VALUES_PER_CALL} values.`)
    .max(MAX_VALUES_PER_CALL, `Give 1 to ${MAX_VALUES_PER_CALL} values; split a longer list.`),
});
export type McpRecordValuesInput = z.infer<typeof recordValuesInputSchema>;

export const recordValuesOutputSchema = z.strictObject({
  /** One outcome per item, in the order given. */
  results: z.array(
    z.strictObject({
      /** The value as stored for this item's holding and date. */
      value: mcpValueSchema,
      /** It replaced a value already stored for that holding and date. */
      replaced: z.boolean(),
      warnings: z.array(mcpWarningSchema),
    }),
  ),
  /** The ledger's `data_version` after the write. */
  data_version: z.int(),
  warnings: z.array(mcpWarningSchema),
});
export type McpRecordValuesOutput = z.infer<typeof recordValuesOutputSchema>;
