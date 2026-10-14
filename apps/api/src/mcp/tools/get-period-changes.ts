import {
  getPeriodChangesInputSchema,
  getPeriodChangesOutputSchema,
  type McpGetPeriodChangesInput,
  type McpGetPeriodChangesOutput,
  type PeriodQuery,
} from '@netnet/contracts';
import type { ToolCtx } from '../context';
import { major } from '../mappers';
import type { ToolDef } from '../tool';

/** `get_period_changes`: each calendar period's end value, change and top contributors. */
export const getPeriodChangesTool: ToolDef<McpGetPeriodChangesInput, McpGetPeriodChangesOutput> = {
  name: 'get_period_changes',
  title: 'Period changes',
  description:
    'Net-worth change per calendar month, quarter or year in the base currency: each ' +
    'period-end value, its change, and the holdings that drove it. Each period says whether ' +
    'it is carried or observed.',
  kind: 'read',
  scope: 'ledger.read',
  annotations: { readOnlyHint: true, openWorldHint: false },
  inputSchema: getPeriodChangesInputSchema,
  outputSchema: getPeriodChangesOutputSchema,
  renames: {},
  run: async (ctx: ToolCtx, input) => {
    const query: PeriodQuery = {
      view: input.view,
      ...(input.periods === undefined ? {} : { periods: input.periods }),
      ...(input.drivers === undefined ? {} : { drivers: input.drivers }),
    };
    const table = await ctx.ledger(ctx.userId, ctx.actor, (l) => l.periods(query));
    return {
      currency: table.currency,
      view: table.view,
      periods: table.periods.map((p) => ({
        start: p.start,
        end: p.end,
        end_value: major(p.endValue, table.currency),
        change: major(p.change, table.currency),
        change_pct: p.changePct,
        carried: p.carried,
        drivers: p.drivers.map((d) => ({
          holding_id: d.holdingId,
          name: d.name,
          contribution: major(d.contribution, table.currency),
        })),
      })),
    };
  },
  text: (output) => `${output.periods.length} ${output.view} periods in ${output.currency}.`,
};
