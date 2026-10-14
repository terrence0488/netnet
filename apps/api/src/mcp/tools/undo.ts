import {
  undoInputSchema,
  undoOutputSchema,
  type McpUndoInput,
  type McpUndoOutput,
  type UndoTarget,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { trackWriteEvents } from '../events';
import { undoResultToMcp, writeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `undo`: reverses one entry, or a whole agent turn newest first and all or nothing. */
export const undoTool: ToolDef<McpUndoInput, McpUndoOutput> = {
  name: 'undo',
  title: 'Undo',
  description:
    'Reverse one activity entry (entry_id), or a whole agent turn (batch_id) newest first and ' +
    'all or nothing. An entry is restored exactly, and only while nothing changed it since; ' +
    'otherwise the answer is UNDO_CONFLICT naming the later change to undo first. Every undo ' +
    'is itself an entry, so it can be undone too.',
  kind: 'write',
  scope: 'ledger.write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: undoInputSchema,
  outputSchema: undoOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const target: UndoTarget =
      input.entry_id !== undefined ? { entryId: input.entry_id } : { batchId: input.batch_id! };
    const write = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.undo(target), { write: true });
    trackWriteEvents(ctx, write.events);
    return writeToMcp(write, undoResultToMcp(write.result));
  },
  text: (output) =>
    output.result.undone.length === 0
      ? 'Nothing to undo: every entry was already undone.'
      : `Undid ${output.result.undone.length} ${output.result.undone.length === 1 ? 'change' : 'changes'}.`,
};
