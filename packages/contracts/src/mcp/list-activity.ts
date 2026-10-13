import { z } from 'zod';
import { mcpActivityLimit, mcpAuditEntrySchema, mcpCursor, mcpId } from './shared';

/** `list_activity`: the audit log, newest first, optionally one agent turn. */
export const listActivityInputSchema = z.strictObject({
  cursor: mcpCursor.optional(),
  limit: mcpActivityLimit,
  batch_id: mcpId.optional(),
});
export type McpListActivityInput = z.infer<typeof listActivityInputSchema>;

export const listActivityOutputSchema = z.strictObject({
  entries: z.array(mcpAuditEntrySchema),
  /** Pass as `cursor` for the next page; null on the last. */
  next_cursor: z.string().nullable(),
});
export type McpListActivityOutput = z.infer<typeof listActivityOutputSchema>;
