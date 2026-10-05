import { z } from 'zod';
import { MAX_NAME_LENGTH } from '../ledger';
import { mcpCursor, mcpFilterIds, mcpHoldingsLimit, mcpHoldingViewSchema } from './shared';

/** `list_holdings`: holdings with latest value, as-of, staleness and access. */
export const listHoldingsInputSchema = z.strictObject({
  query: z.string().trim().max(MAX_NAME_LENGTH).optional(),
  type_ids: mcpFilterIds.optional(),
  tag_ids: mcpFilterIds.optional(),
  archived: z.enum(['exclude', 'include', 'only']).optional(),
  stale_only: z.boolean().optional(),
  cursor: mcpCursor.optional(),
  limit: mcpHoldingsLimit,
});
export type McpListHoldingsInput = z.infer<typeof listHoldingsInputSchema>;

export const listHoldingsOutputSchema = z.strictObject({
  holdings: z.array(mcpHoldingViewSchema),
  /** Pass as `cursor` for the next page; null on the last. */
  next_cursor: z.string().nullable(),
});
export type McpListHoldingsOutput = z.infer<typeof listHoldingsOutputSchema>;
