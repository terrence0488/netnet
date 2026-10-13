import {
  listActivityInputSchema,
  listActivityOutputSchema,
  type ActivityQuery,
  type McpListActivityInput,
  type McpListActivityOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { auditEntryToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `list_activity`: every change the person or an agent made, newest first. */
export const listActivityTool: ToolDef<McpListActivityInput, McpListActivityOutput> = {
  name: 'list_activity',
  title: 'List activity',
  description:
    'Every change you or the person made, newest first, each with who made it, when, the old ' +
    'and new values, and which agent turn it belongs to. Page through with cursor; filter to ' +
    'one turn with batch_id. Undo one entry or a whole turn with undo.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: listActivityInputSchema,
  outputSchema: listActivityOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const query: ActivityQuery = {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.batch_id === undefined ? {} : { batchId: input.batch_id }),
    };
    const page = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.activity(query));
    return { entries: page.items.map(auditEntryToMcp), next_cursor: page.nextCursor };
  },
  text: (output) =>
    `${output.entries.length} ${output.entries.length === 1 ? 'entry' : 'entries'}` +
    `${output.next_cursor === null ? '' : ' (more pages follow)'}.`,
};
