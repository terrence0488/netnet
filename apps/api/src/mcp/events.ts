import type { DomainEvent, ErrorCode, EventName, EventProps } from '@netnet/contracts';
import type { Client } from '../auth/classify';
import type { ToolCtx } from './context';
import type { ToolKind } from './tool';

/**
 * What a tool call records, after the response (architecture §5.1, §7.7): `agent_tool_called`
 * for every call, and a write's own events with `source: agent` (PRD J3, J6). Nothing here
 * carries an amount or a name (N9): the schemas hold enums, a tool name and a latency only.
 */

/** A write's domain events, each with the person's segment. */
export function trackWriteEvents(ctx: ToolCtx, events: readonly DomainEvent[]): void {
  if (events.length === 0) return;
  const to = {
    userId: ctx.userId,
    segment: ctx.profile.segment,
    appVersion: ctx.deps.appVersion(),
  };
  ctx.background(
    Promise.all(
      events.map((event) =>
        ctx.deps.track(event.name as EventName, event.props as EventProps<EventName>, to),
      ),
    ),
  );
}

export interface ToolCalled {
  tool: string;
  kind: ToolKind;
  /** `ok`, or the error code the call returned. */
  outcome: 'ok' | ErrorCode;
  latencyMs: number;
  client: Client;
}

/** `agent_tool_called {tool, kind, outcome, latency_ms, client}`, for every call. */
export function trackToolCalled(ctx: ToolCtx, called: ToolCalled): void {
  ctx.background(
    ctx.deps.track(
      'agent_tool_called',
      {
        tool: called.tool as EventProps<'agent_tool_called'>['tool'],
        kind: called.kind,
        outcome: called.outcome,
        latency_ms: Math.max(0, Math.min(900_000, Math.round(called.latencyMs))),
        client: called.client,
      },
      {
        userId: ctx.userId,
        segment: ctx.profile.segment,
        appVersion: ctx.deps.appVersion(),
      },
    ),
  );
}
