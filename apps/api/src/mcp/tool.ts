import type { AgentTool } from '@netnet/contracts';
import type { StandardSchemaWithJSON, ToolAnnotations } from '@modelcontextprotocol/server';
import type { ToolCtx } from './context';

/** What `agent_tool_called {kind}` carries: reads never write. */
export type ToolKind = 'read' | 'write';

/** The scope a tool needs: reads `ledger.read`, writes `ledger.write`. */
export type ToolScope = 'ledger.read' | 'ledger.write';

/**
 * A tool's zod schema as the server uses it: converted to JSON Schema for `tools/list` (through
 * Standard Schema), and read with `safeParse` around the call, without the API depending on zod.
 */
export interface McpSchema<Out> extends StandardSchemaWithJSON<unknown, Out> {
  safeParse(input: unknown):
    | { success: true; data: Out }
    | {
        success: false;
        error: {
          issues: readonly {
            code: string;
            path: PropertyKey[];
            message: string;
            keys?: string[];
          }[];
        };
      };
}

/**
 * One MCP tool (architecture §7.4): its registration, its schemas from
 * `packages/contracts/src/mcp/`, and what it does. `run` maps the parsed input onto the Ledger
 * and the output back; `renames` maps the Ledger field segments whose MCP name is not their
 * snake_case. Methods (not properties) so the registry holds every tool as one `ToolDef`.
 */
export interface ToolDef<In = unknown, Out = unknown> {
  name: AgentTool;
  title: string;
  /** What it does and when to call it. Never user data, never local scheme names (N10). */
  description: string;
  kind: ToolKind;
  scope: ToolScope;
  annotations: ToolAnnotations;
  inputSchema: McpSchema<In>;
  outputSchema: McpSchema<Out>;
  renames: Record<string, string>;
  run(ctx: ToolCtx, input: In): Promise<Out>;
  /** The short text rendering beside `structuredContent`: counts and names, never amounts. */
  text(output: Out): string;
}
