import { z } from 'zod';
import { PERIOD_VIEWS } from '../figures';
import { MAX_DRIVERS, MAX_PERIODS } from '../ledger';
import { mcpCurrency } from './shared';

/** `get_period_changes`: each calendar period's end value, change and top contributors. */
export const getPeriodChangesInputSchema = z.strictObject({
  view: z.enum(PERIOD_VIEWS),
  periods: z
    .int('Give the periods as a whole number.')
    .min(1, 'Give at least 1 period.')
    .max(MAX_PERIODS, `Give at most ${MAX_PERIODS} periods.`)
    .optional(),
  drivers: z
    .int('Give the drivers as a whole number.')
    .min(1, 'Give at least 1 driver.')
    .max(MAX_DRIVERS, `Give at most ${MAX_DRIVERS} drivers.`)
    .optional(),
});
export type McpGetPeriodChangesInput = z.infer<typeof getPeriodChangesInputSchema>;

export const getPeriodChangesOutputSchema = z.strictObject({
  currency: mcpCurrency,
  view: z.enum(PERIOD_VIEWS),
  periods: z.array(
    z.strictObject({
      /** The calendar period's first day. */
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** Its last day — or today, when the period is the current one and still open. */
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** Net worth at `end`: assets minus liabilities. */
      end_value: z.number(),
      /** `end_value` minus the previous period's end value (0 before the first). */
      change: z.number(),
      /** Percent of the previous end value's size; null when that was 0. */
      change_pct: z.number().nullable(),
      /** Some holding counted here had no value dated inside this period. */
      carried: z.boolean(),
      /** The holdings with a nonzero contribution, ranked by contribution, largest first. */
      drivers: z.array(
        z.strictObject({
          holding_id: z.string(),
          name: z.string(),
          /** Its signed end value minus its signed value at the previous period's end. */
          contribution: z.number(),
        }),
      ),
    }),
  ),
});
export type McpGetPeriodChangesOutput = z.infer<typeof getPeriodChangesOutputSchema>;
