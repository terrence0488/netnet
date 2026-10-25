import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { ToolSpec } from '../model';
import {
  approve,
  approvalQuery,
  authorizeUrl,
  discover,
  exchange,
  register,
  signUp,
  type OAuthServer,
  type Registration,
  type Session,
} from './oauth';

/**
 * The NetNet arm's agent (P4-T9): a real MCP client against the running app, connected the way a
 * native agent connects — discovery, DCR, PKCE, the person approving through the approval API,
 * the code exchanged for a bearer token — and then the server's tools, listed and called over
 * MCP. The API's connector needs a public URL, so the harness never hands tools to the server:
 * it lists them here and proxies each call itself, which is exactly what a client-side agent does.
 */

/** One tool result as the model receives it: the text MCP returned, and whether it failed. */
export interface ToolOutcome {
  readonly text: string;
  readonly isError: boolean;
  readonly latencyMs: number;
}

/** A connected agent: the tools it may give the model, and the proxy that runs them. */
export interface NetNetAgent {
  readonly tools: ToolSpec[];
  /** The server's instructions, which go in the system prompt as a client puts them. */
  readonly instructions: string | undefined;
  callTool(name: string, input: unknown): Promise<ToolOutcome>;
  close(): Promise<void>;
}

/** A fictional address for the run's account: never a real inbox, never printed in a report. */
export function runEmail(run: string): string {
  return `m12-${run}@example.com`;
}

/** The run's account on the scratch app, signed up and verified the way a person's would be. */
export async function makeAccount(options: {
  origin: string;
  email: string;
  verify: (email: string) => Promise<void>;
}): Promise<Session> {
  const session = await signUp({
    origin: options.origin,
    email: options.email,
    password: 'correct horse battery',
    timeZone: 'Asia/Singapore',
    ip: '192.0.2.10',
  });
  await options.verify(options.email);
  return session;
}

/** Registers, approves and exchanges in one go: the agent's bearer token. */
export async function authorize(
  origin: string,
  session: Session,
  name: string,
): Promise<{ server: OAuthServer; registration: Registration; token: string }> {
  const server = await discover(origin);
  const registration = await register(server, { name, ip: '198.51.100.10' });
  const query = await approvalQuery(origin, authorizeUrl(server, registration), session);
  const approved = await approve(origin, session, query);
  if (!approved.scopes.includes('ledger.read')) {
    throw new Error('The approval did not grant ledger.read, so no tool could be called.');
  }
  const token = await exchange(server, registration, approved.code);
  return { server, registration, token };
}

/** Connects the MCP client with `token`, lists the tools and keeps the proxy open. */
export async function connect(origin: string, token: string): Promise<NetNetAgent> {
  const client = new Client({ name: 'm12-harness', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    authProvider: { token: () => Promise.resolve(token) },
  });
  await client.connect(transport);

  const listed = await client.listTools();
  const tools: ToolSpec[] = listed.tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
  }));

  return {
    tools,
    instructions: client.getInstructions(),
    async callTool(name, input) {
      const started = Date.now();
      const result = await client.callTool({
        name,
        arguments: (typeof input === 'object' && input !== null ? input : {}) as Record<
          string,
          unknown
        >,
      });
      const latencyMs = Date.now() - started;
      const text = result.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n');
      return {
        text:
          text !== ''
            ? text
            : JSON.stringify(result.structuredContent ?? { error: 'the tool answered no text' }),
        isError: result.isError === true,
        latencyMs,
      };
    },
    close: async () => {
      await client.close();
    },
  };
}
