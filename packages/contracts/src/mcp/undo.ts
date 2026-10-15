import { z } from 'zod';
import { mcpId, mcpUndoResultSchema, mcpWriteOutput } from './shared';

/** `undo`: undo one entry, or a whole agent turn newest first and all or nothing. */
export const undoInputSchema = z
  .strictObject({ entry_id: mcpId.optional(), batch_id: mcpId.optional() })
  .refine((t) => (t.entry_id === undefined) !== (t.batch_id === undefined), {
    path: ['entry_id'],
    message: 'Give entry_id for one entry, or batch_id for a whole agent turn, but not both.',
  });
export type McpUndoInput = z.infer<typeof undoInputSchema>;

export const undoOutputSchema = mcpWriteOutput(mcpUndoResultSchema);
export type McpUndoOutput = z.infer<typeof undoOutputSchema>;
