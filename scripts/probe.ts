/**
 * `pnpm probe`: the 6-hourly MCP probe (architecture §9.3, §10; `ops/probe.md`).
 *
 * Against one origin, with the probe account's long-lived connection: refreshes the access
 * token (the server rotates the refresh token, which the workflow writes back to the
 * `PROBE_REFRESH_TOKEN` secret), lists the tools, and calls `get_financial_context`. Each call
 * logs its client-observed time next to the function's `Server-Timing`, the production measure
 * of the first call after idle. It never registers or authorizes: never a connection per run.
 *
 * Usage: `pnpm probe --origin https://‹domain›` with `PROBE_CLIENT_ID` and
 * `PROBE_REFRESH_TOKEN` set. Writes the rotated token to `$GITHUB_OUTPUT` as `refresh_token`;
 * without it (a local run) the token is printed once, marked, so it can be stored again.
 *
 * Nothing it prints carries an amount, a holding name or the context: statuses, sizes and
 * timings only. Tokens are never printed in the workflow path.
 */
import { appendFileSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

const PROTOCOL_VERSION = '2026-07-28';
const TIMEOUT_MS = 30_000;

export interface ProbeCredentials {
  origin: string;
  clientId: string;
  refreshToken: string;
}

/** One authenticated MCP call, timed on both ends of the wire. */
export interface ProbeCall {
  name: string;
  ok: boolean;
  /** What the probe saw: the whole round trip, including any cold start. */
  clientMs: number;
  /** What the function saw (`Server-Timing`), or null when the header is missing. */
  serverMs: number | null;
  requestId: string | null;
}

export interface ProbeResult {
  calls: ProbeCall[];
  /** The rotated refresh token: the workflow stores it back as the secret. */
  refreshToken: string;
  tools: string[];
}

export class ProbeError extends Error {
  constructor(
    message: string,
    /** True when the Founder must re-run the one-time setup (`ops/probe.md`). */
    readonly setupNeeded = false,
  ) {
    super(message);
    this.name = 'ProbeError';
  }
}

export function readCredentials(env: NodeJS.ProcessEnv = process.env): ProbeCredentials {
  const origin = env.PROBE_ORIGIN;
  const clientId = env.PROBE_CLIENT_ID;
  const refreshToken = env.PROBE_REFRESH_TOKEN;
  if (!origin || !clientId || !refreshToken) {
    throw new ProbeError(
      'PROBE_ORIGIN, PROBE_CLIENT_ID and PROBE_REFRESH_TOKEN must all be set (see ops/probe.md).',
    );
  }
  return { origin: origin.replace(/\/$/, ''), clientId, refreshToken };
}

function serverMsOf(res: Response): number | null {
  const match = /dur=(\d+)/.exec(res.headers.get('Server-Timing') ?? '');
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** The JSON-RPC body of an MCP response: plain JSON, or the last event of an SSE stream. */
export function rpcBody(text: string, contentType: string): Record<string, unknown> {
  if (!contentType.includes('text/event-stream')) {
    return (text === '' ? {} : JSON.parse(text)) as Record<string, unknown>;
  }
  const events = text.split('\n\n').filter((block) => block.includes('data:'));
  const last = events.at(-1) ?? '';
  const data = last
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');
  return JSON.parse(data) as Record<string, unknown>;
}

/**
 * Exchanges the stored refresh token for a token pair. The server rotates: the refresh token
 * returned replaces the one sent, which dies after its short reuse window.
 */
export async function refreshAccessToken(credentials: ProbeCredentials): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const res = await fetch(`${credentials.origin}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
      resource: `${credentials.origin}/mcp`,
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const error = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
    if (error === 'invalid_grant') {
      throw new ProbeError(
        'The probe refresh token is rejected (invalid_grant): the connection was revoked or ' +
          'another run rotated past it. Re-run the one-time setup in ops/probe.md.',
        true,
      );
    }
    throw new ProbeError(`Token refresh failed: HTTP ${res.status}.`);
  }
  const body = (await res.json()) as { access_token?: unknown; refresh_token?: unknown };
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    throw new ProbeError('Token refresh answered without a token pair.');
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/** One JSON-RPC call over `/mcp`, timed. Never logs the body: it can carry money. */
export async function mcpCall(
  origin: string,
  accessToken: string,
  method: string,
  params: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; call: ProbeCall }> {
  const started = performance.now();
  // 2026-07-28 wants the method (and a call's tool) in headers, and the per-request envelope
  // in `_meta`.
  const envelope = {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': PROTOCOL_VERSION,
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  };
  const tool = method === 'tools/call' && typeof params.name === 'string' ? params.name : undefined;
  const res = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
      'Mcp-Method': method,
      ...(tool === undefined ? {} : { 'Mcp-Name': tool }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: envelope }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const clientMs = Math.round(performance.now() - started);
  const call: ProbeCall = {
    name: method,
    ok: false,
    clientMs,
    serverMs: serverMsOf(res),
    requestId: res.headers.get('X-Request-Id'),
  };
  if (!res.ok) throw new ProbeError(`MCP ${method} failed: HTTP ${res.status}.`);
  const body = rpcBody(await res.text(), res.headers.get('Content-Type') ?? '');
  const error = (body.result as { structuredContent?: { error?: unknown } } | undefined)
    ?.structuredContent?.error;
  if (body.error !== undefined || (error !== undefined && error !== null)) {
    const codeValue =
      (body.error as { code?: unknown } | undefined)?.code ??
      (error as { code?: unknown } | undefined)?.code;
    const code =
      typeof codeValue === 'string' || typeof codeValue === 'number' ? codeValue : 'unknown';
    throw new ProbeError(`MCP ${method} answered an error (code ${code}).`);
  }
  return { body, call: { ...call, ok: true } };
}

function logCall(call: ProbeCall): void {
  console.log(
    `probe ${call.name}: ${call.ok ? 'ok' : 'FAILED'} ` +
      `client_ms=${call.clientMs} server_ms=${call.serverMs ?? '?'} ` +
      `request_id=${call.requestId ?? '?'}`,
  );
}

/**
 * The whole probe: refresh, `tools/list`, `get_financial_context`. Asserts the context tool is
 * listed and the context call succeeds; returns the rotated token with the timings. The rotated
 * token is emitted the moment refresh succeeds, before the MCP calls: even a failed run must
 * preserve it, or the family is bricked (the old token dies after its reuse window).
 */
export async function runProbe(
  credentials: ProbeCredentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeResult> {
  const { accessToken, refreshToken } = await refreshAccessToken(credentials);
  console.log('probe token: refreshed (the stored token is rotated)');
  emitRotatedToken(refreshToken, env);
  const listed = await mcpCall(credentials.origin, accessToken, 'tools/list', {});
  logCall(listed.call);
  const tools = (
    ((listed.body.result as { tools?: unknown } | undefined)?.tools as
      { name?: unknown }[] | undefined) ?? []
  ).map((tool) => String(tool.name));
  if (!tools.includes('get_financial_context')) {
    throw new ProbeError('tools/list does not include get_financial_context.');
  }
  console.log(`probe tools: ${tools.length} listed, including get_financial_context`);
  const context = await mcpCall(credentials.origin, accessToken, 'tools/call', {
    name: 'get_financial_context',
    arguments: {},
  });
  logCall(context.call);
  return { calls: [listed.call, context.call], refreshToken, tools };
}

/** Hands the rotated token to the workflow, or — locally only — prints it once, marked. */
export function emitRotatedToken(refreshToken: string, env: NodeJS.ProcessEnv = process.env): void {
  const output = env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `refresh_token=${refreshToken}\n`);
    console.log('probe rotation: the new token is in $GITHUB_OUTPUT (never shown)');
    return;
  }
  console.log(
    'probe rotation: NO $GITHUB_OUTPUT (a local run). Store this as PROBE_REFRESH_TOKEN now — ' +
      'the old token dies after its reuse window:',
  );
  console.log(`PROBE_REFRESH_TOKEN=${refreshToken}`);
}

function originFromArgs(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  const flag = argv.indexOf('--origin');
  const fromFlag = flag === -1 ? undefined : argv[flag + 1];
  return fromFlag ?? env.PROBE_ORIGIN;
}

async function main(): Promise<void> {
  // GitHub's runners sometimes need longer than Node's 250 ms to reach Singapore (spike Q6).
  setDefaultAutoSelectFamilyAttemptTimeout(2000);
  try {
    const origin = originFromArgs(process.argv.slice(2), process.env);
    if (origin === undefined) throw new ProbeError('Usage: pnpm probe --origin https://‹domain›.');
    await runProbe(readCredentials({ ...process.env, PROBE_ORIGIN: origin }));
    console.log('probe: passed');
  } catch (error) {
    console.error(`probe: FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]?.endsWith('probe.ts') ?? false;
if (invoked) await main();
