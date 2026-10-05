import {
  getTaxonomyInputSchema,
  getTaxonomyOutputSchema,
  type McpGetTaxonomyInput,
  type McpGetTaxonomyOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { tagToMcp, userTypeToMcp } from '../mappers';
import type { ToolDef } from '../tool';

/** `get_taxonomy`: the user's types (label, universal meaning) and tags. */
export const getTaxonomyTool: ToolDef<McpGetTaxonomyInput, McpGetTaxonomyOutput> = {
  name: 'get_taxonomy',
  title: 'Taxonomy',
  description:
    'The types — each with what it means — and tags. Read this before creating holdings, ' +
    'so new ones reuse what exists.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getTaxonomyInputSchema,
  outputSchema: getTaxonomyOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx) => {
    const snapshot = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.snapshot());
    const chain = await ctx.options.content.chain();
    return {
      types: snapshot.types.map((t) => userTypeToMcp(t, chain)),
      tags: snapshot.tags.map(tagToMcp),
    };
  },
  text: (output) => `${output.types.length} types, ${output.tags.length} tags.`,
};
