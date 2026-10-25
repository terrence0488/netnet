import {
  getNetWorthHistoryInputSchema,
  getNetWorthHistoryOutputSchema,
  type HistoryQuery,
  type McpGetNetWorthHistoryInput,
  type McpGetNetWorthHistoryOutput,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { major } from '../mappers';
import type { ToolDef } from '../tool';

/** `get_net_worth_history`: the series in the base currency; each point carried or observed. */
export const getNetWorthHistoryTool: ToolDef<
  McpGetNetWorthHistoryInput,
  McpGetNetWorthHistoryOutput
> = {
  name: 'get_net_worth_history',
  title: 'Net worth history',
  description:
    'Net worth over time in the base currency, split by type, access or currency. ' +
    'Each point says whether it is carried or observed.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getNetWorthHistoryInputSchema,
  outputSchema: getNetWorthHistoryOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const query: HistoryQuery = {
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
      ...(input.interval === undefined ? {} : { interval: input.interval }),
      ...(input.group_by === undefined ? {} : { groupBy: input.group_by }),
      ...(input.type_ids === undefined ? {} : { typeIds: [...input.type_ids] }),
      ...(input.tag_ids === undefined ? {} : { tagIds: [...input.tag_ids] }),
    };
    const series = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.history(query));
    return {
      currency: series.currency,
      interval: series.interval,
      group_by: series.groupBy,
      points: series.points.map((p) => ({
        date: p.date,
        total: major(p.total, series.currency),
        ...(p.groups === undefined
          ? {}
          : {
              groups: Object.fromEntries(
                Object.entries(p.groups).map(([key, minor]) => [
                  key,
                  major(minor, series.currency),
                ]),
              ),
            }),
        carried: p.carried,
      })),
    };
  },
};
