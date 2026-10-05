import { z } from 'zod';
import { GROUP_BYS, INTERVALS } from '../figures';
import { mcpCurrency, mcpDate, mcpFilterIds } from './shared';

/** `get_net_worth_history`: the series in the base currency; each point carried or observed. */
export const getNetWorthHistoryInputSchema = z
  .strictObject({
    from: mcpDate.optional(),
    to: mcpDate.optional(),
    interval: z.enum(INTERVALS).optional(),
    group_by: z.enum(GROUP_BYS).optional(),
    type_ids: mcpFilterIds.optional(),
    tag_ids: mcpFilterIds.optional(),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    path: ['from'],
    message: 'Give a from date on or before the to date.',
  });
export type McpGetNetWorthHistoryInput = z.infer<typeof getNetWorthHistoryInputSchema>;

export const getNetWorthHistoryOutputSchema = z.strictObject({
  currency: mcpCurrency,
  interval: z.enum(INTERVALS),
  group_by: z.enum(GROUP_BYS),
  points: z.array(
    z.strictObject({
      /** The bucket's last day, or the range's end in the last bucket. */
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** Net worth on that date: assets minus liabilities. */
      total: z.number(),
      /** The total split by type id, access bucket or currency; the groups sum to `total`. */
      groups: z.record(z.string(), z.number()).optional(),
      /** Some holding counted here had no value dated inside this bucket. */
      carried: z.boolean(),
    }),
  ),
});
export type McpGetNetWorthHistoryOutput = z.infer<typeof getNetWorthHistoryOutputSchema>;
