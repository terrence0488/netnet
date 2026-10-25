/**
 * `pnpm listing:tools --origin <url>`: the tool list a directory's submission form asks for
 * (Claude's connector portal and OpenAI's plugin portal both read `tools/list` themselves, but
 * their review notes and NetNet's own listings need the same list in text).
 *
 * It sends one stateless `tools/list` per page on 2026-07-28 (the same request `scripts/probe.ts`
 * makes), follows `nextCursor`, and prints a Markdown table of name, title, read or write,
 * destructive and description. Nothing is retyped by hand: the descriptions are the server's own.
 *
 * The token comes from `MCP_TOKEN`, never a flag, so it does not appear in the process list or a
 * shell history. Without one, only a server that allows anonymous `tools/list` answers; NetNet's
 * returns 401 and the script says so. `--json` prints the rows instead of the table.
 *
 * Local use: start the app (`pnpm dev`), connect a test agent, and pass its access token. The
 * script accepts `http://` only for a loopback origin, so a real run is always over TLS.
 */
import { parseArgs } from 'node:util';
import { rpcBody } from './probe';

const PROTOCOL_VERSION = '2026-07-28';
const TIMEOUT_MS = 30_000;

/** A tool as `tools/list` shows it: only the fields a listing needs. */
export interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

/** One row of the table, and of `--json`. */
export interface ToolRow {
  name: string;
  title: string;
  kind: 'read' | 'write';
  destructive: boolean;
  description: string;
}

export class ListingToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListingToolsError';
  }
}

/**
 * The endpoint `--origin` names: the origin itself, or the connector path under it. A URL that
 * already names `/mcp` is used as given, so a preview or a local port works too.
 */
export function endpointFor(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ListingToolsError(`--origin is not a URL: ${origin}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ListingToolsError('--origin must be an http(s) URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && !loopback) {
    throw new ListingToolsError('--origin must use https (http is allowed only for localhost).');
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/mcp';
  url.search = '';
  url.hash = '';
  return url.toString();
}

/** The tools in one JSON-RPC response, and the cursor of the next page when there is one. */
export function toolsOf(body: unknown): { tools: ListedTool[]; nextCursor?: string } {
  if (typeof body !== 'object' || body === null) throw new ListingToolsError('No JSON-RPC body.');
  const rpc = body as { result?: unknown; error?: { message?: unknown } };
  if (rpc.error !== undefined) {
    const message = typeof rpc.error.message === 'string' ? rpc.error.message : 'unknown error';
    throw new ListingToolsError(`The server answered an error: ${message}`);
  }
  const result = rpc.result as { tools?: unknown; nextCursor?: unknown } | undefined;
  if (result === undefined || !Array.isArray(result.tools)) {
    throw new ListingToolsError('The response has no result.tools.');
  }
  const tools = result.tools.map((value, i): ListedTool => {
    if (typeof value !== 'object' || value === null) {
      throw new ListingToolsError(`result.tools[${i}] is not an object.`);
    }
    const tool = value as Record<string, unknown>;
    if (typeof tool.name !== 'string' || tool.name === '') {
      throw new ListingToolsError(`result.tools[${i}] has no name.`);
    }
    const annotations =
      typeof tool.annotations === 'object' && tool.annotations !== null
        ? (tool.annotations as ListedTool['annotations'])
        : undefined;
    return {
      name: tool.name,
      ...(typeof tool.title === 'string' ? { title: tool.title } : {}),
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      ...(annotations === undefined ? {} : { annotations }),
    };
  });
  return {
    tools,
    ...(typeof result.nextCursor === 'string' ? { nextCursor: result.nextCursor } : {}),
  };
}

/**
 * A tool's kind from its annotations: `readOnlyHint` decides, as Claude's portal does. A tool
 * that declares no `readOnlyHint` is reported as a write, because that is its effect until the
 * server says otherwise; `--check` names those tools.
 */
export function rowOf(tool: ListedTool): ToolRow {
  const hint = tool.annotations?.readOnlyHint;
  return {
    name: tool.name,
    title: tool.title ?? '(no title)',
    kind: hint === true ? 'read' : 'write',
    destructive: tool.annotations?.destructiveHint === true,
    description: (tool.description ?? '(no description)').replace(/\s+/g, ' ').trim(),
  };
}

/** Tools whose listing would fail a directory that requires titles and hints. */
export function missingAnnotations(tools: readonly ListedTool[]): string[] {
  return tools.flatMap((tool) => {
    const problems: string[] = [];
    if (tool.title === undefined || tool.title.trim() === '') problems.push('no title');
    if (tool.description === undefined || tool.description.trim() === '') {
      problems.push('no description');
    }
    // Claude asks for the applicable hint: readOnlyHint on every tool, or destructiveHint on a
    // write. A non-destructive write declares readOnlyHint: false, destructiveHint: false.
    if (
      tool.annotations?.readOnlyHint === undefined &&
      tool.annotations?.destructiveHint === undefined
    ) {
      problems.push('no readOnlyHint or destructiveHint');
    }
    return problems.length === 0 ? [] : [`${tool.name}: ${problems.join(', ')}`];
  });
}

/** The Markdown table, as a submission form or a review note takes it. */
export function markdownTable(rows: readonly ToolRow[]): string {
  const cell = (text: string) => text.replaceAll('|', '\\|');
  const lines = [
    '| Tool | Title | Read or write | Destructive | Description |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${row.name}\` | ${cell(row.title)} | ${row.kind} | ${row.destructive ? 'yes' : 'no'} | ${cell(row.description)} |`,
    ),
  ];
  return lines.join('\n');
}

/** One `tools/list` page. The 2026-07-28 envelope is stateless: no handshake, no session id. */
async function listPage(
  endpoint: string,
  token: string | undefined,
  cursor: string | undefined,
): Promise<{ tools: ListedTool[]; nextCursor?: string }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': 'tools/list',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {
        ...(cursor === undefined ? {} : { cursor }),
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (response.status === 401) {
    throw new ListingToolsError(
      "The server answered HTTP 401: set MCP_TOKEN to a connected agent's access token.",
    );
  }
  if (!response.ok) {
    throw new ListingToolsError(`The server answered HTTP ${response.status}.`);
  }
  return toolsOf(rpcBody(text, response.headers.get('content-type') ?? ''));
}

/** Every tool the server lists, following `nextCursor`. */
export async function listTools(options: {
  origin: string;
  token?: string | undefined;
}): Promise<ListedTool[]> {
  const endpoint = endpointFor(options.origin);
  const tools: ListedTool[] = [];
  let cursor: string | undefined;
  // A cursor loop would spin forever on a broken server; a real list has a handful of pages.
  for (let page = 0; page < 100; page += 1) {
    const listed = await listPage(endpoint, options.token, cursor);
    tools.push(...listed.tools);
    if (listed.nextCursor === undefined || listed.nextCursor === cursor) return tools;
    cursor = listed.nextCursor;
  }
  throw new ListingToolsError('The server kept returning a nextCursor after 100 pages.');
}

const USAGE = 'Usage: pnpm listing:tools --origin <url> [--json] [--check]   (token: MCP_TOKEN)';

export interface ListingIo {
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
  error: (line: string) => void;
}

/** The script: returns its exit code. */
export async function main(args: readonly string[], io: ListingIo): Promise<number> {
  let values: {
    origin?: string | undefined;
    json?: boolean | undefined;
    check?: boolean | undefined;
  };
  try {
    values = parseArgs({
      args: [...args],
      options: {
        origin: { type: 'string' },
        json: { type: 'boolean' },
        check: { type: 'boolean' },
      },
    }).values;
  } catch {
    io.error(`listing:tools: ${USAGE}`);
    return 1;
  }
  if (values.origin === undefined || values.origin.trim() === '') {
    io.error(`listing:tools: name the server. ${USAGE}`);
    return 1;
  }
  try {
    const endpoint = endpointFor(values.origin);
    const tools = await listTools({
      origin: values.origin,
      token: io.env.MCP_TOKEN?.trim() || undefined,
    });
    const rows = tools.map(rowOf);
    if (values.json === true) {
      io.log(JSON.stringify({ endpoint, tools: rows }, null, 2));
    } else {
      io.log(`<!-- ${rows.length} tools from ${endpoint} (tools/list, ${PROTOCOL_VERSION}) -->`);
      io.log(markdownTable(rows));
    }
    if (values.check === true) {
      const problems = missingAnnotations(tools);
      if (problems.length > 0) {
        for (const problem of problems) io.error(`listing:tools: ${problem}`);
        return 1;
      }
    }
    return 0;
  } catch (error) {
    io.error(`listing:tools: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] !== undefined && /listing-tools\.(ts|js)$/.test(process.argv[1])) {
  process.exitCode = await main(process.argv.slice(2), {
    env: process.env,
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  });
}
