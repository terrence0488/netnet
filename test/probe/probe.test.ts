import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  emitRotatedToken,
  mcpCall,
  ProbeError,
  readCredentials,
  refreshAccessToken,
  rpcBody,
  runProbe,
  type ProbeCredentials,
} from '../../scripts/probe';
import { json, startStubOrigin, type StubOrigin } from '../support/http-stub';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const run = promisify(execFile);

const ACCESS_TOKEN = 'probe-access-token';
const ROTATED_TOKEN = 'probe-rotated-refresh-token';

let stubs: StubOrigin[] = [];

afterEach(async () => {
  for (const stub of stubs) await stub.close();
  stubs = [];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function startProbeOrigin(options: { grant?: string; tools?: string[] } = {}) {
  const stub = await startStubOrigin((req, res) => {
    if (req.method === 'POST' && req.path === '/api/auth/oauth2/token') {
      const params = new URLSearchParams(req.body);
      if (options.grant === 'invalid_grant' || params.get('refresh_token') === 'dead-token') {
        json(res, 400, { error: 'invalid_grant' });
        return;
      }
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('client_id')).toBe('probe-client');
      expect(params.get('resource')?.endsWith('/mcp')).toBe(true);
      json(res, 200, {
        access_token: ACCESS_TOKEN,
        refresh_token: ROTATED_TOKEN,
        expires_in: 3600,
      });
      return;
    }
    if (req.method === 'POST' && req.path === '/mcp') {
      if (req.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
        json(res, 401, { error: { code: 'UNAUTHENTICATED' } });
        return;
      }
      const body = JSON.parse(req.body) as { method?: unknown; params?: Record<string, unknown> };
      expect(req.headers['mcp-method']).toBe(body.method);
      expect(req.headers['mcp-protocol-version']).toBe('2026-07-28');
      expect(
        (body.params as { _meta?: Record<string, unknown> } | undefined)?._meta?.[
          'io.modelcontextprotocol/protocolVersion'
        ],
      ).toBe('2026-07-28');
      const answer = (result: unknown) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Server-Timing': 'netnet;dur=14',
          'X-Request-Id': 'req_probe1',
        });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
      };
      if (body.method === 'tools/list') {
        answer({
          tools: (options.tools ?? ['get_financial_context', 'list_holdings']).map((name) => ({
            name,
          })),
        });
        return;
      }
      if (body.method === 'tools/call') {
        const params = (body.params ?? {}) as { name?: unknown };
        expect(params.name).toBe('get_financial_context');
        // Fictional context: the probe must never print any of it.
        answer({
          content: [{ type: 'text', text: 'Net 23841.17 in demo currency' }],
          structuredContent: { total: '23841.17' },
        });
        return;
      }
      json(res, 400, { error: { code: 'VALIDATION_FAILED' } });
      return;
    }
    json(res, 404, { error: { code: 'NOT_FOUND' } });
  });
  stubs.push(stub);
  return stub;
}

function credentials(
  stub: StubOrigin,
  refreshToken = 'probe-stored-refresh-token',
): ProbeCredentials {
  return { origin: stub.url, clientId: 'probe-client', refreshToken };
}

describe('scripts/probe', () => {
  it('requires every credential', () => {
    expect(() => readCredentials({})).toThrow(ProbeError);
    expect(
      readCredentials({
        PROBE_ORIGIN: 'https://x/',
        PROBE_CLIENT_ID: 'c',
        PROBE_REFRESH_TOKEN: 'r',
      }),
    ).toStrictEqual({ origin: 'https://x', clientId: 'c', refreshToken: 'r' });
  });

  it('refreshes, lists the tools and reads the context, timing each call', async () => {
    const stub = await startProbeOrigin();
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(String(line)));
    const result = await runProbe(credentials(stub), {});

    expect(result.refreshToken).toBe(ROTATED_TOKEN);
    expect(result.tools).toContain('get_financial_context');
    expect(result.calls.map((call) => call.name)).toStrictEqual(['tools/list', 'tools/call']);
    for (const call of result.calls) {
      expect(call.ok).toBe(true);
      expect(call.clientMs).toBeGreaterThanOrEqual(0);
      expect(call.serverMs).toBe(14);
      expect(call.requestId).toBe('req_probe1');
    }
    const timing = logged.find((line) => line.startsWith('probe tools/list:'));
    expect(timing).toContain('client_ms=');
    expect(timing).toContain('server_ms=14');
    // Nothing it prints carries the context's fictional figures.
    expect(logged.join('\n')).not.toContain('23841.17');
  });

  it('never registers or authorizes: one long-lived connection, refreshed', async () => {
    const stub = await startProbeOrigin();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runProbe(credentials(stub), {});
    const paths = stub.requests.map((request) => request.path);
    expect(paths).not.toContain('/api/auth/oauth2/register');
    expect(paths.some((path) => path.includes('authorize'))).toBe(false);
    expect(paths.some((path) => path.includes('approve'))).toBe(false);
    expect(paths.filter((path) => path === '/api/auth/oauth2/token')).toHaveLength(1);
  });

  it('fails setup-needed when the token family is revoked', async () => {
    const stub = await startProbeOrigin({ grant: 'invalid_grant' });
    const error = await refreshAccessToken(credentials(stub)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProbeError);
    expect((error as ProbeError).setupNeeded).toBe(true);
  });

  it('fails when the context tool is not listed', async () => {
    const stub = await startProbeOrigin({ tools: ['list_holdings'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runProbe(credentials(stub), {})).rejects.toThrow(ProbeError);
  });

  it('preserves the rotated token even when a later call fails', async () => {
    const stub = await startProbeOrigin({ tools: ['list_holdings'] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'probe-fail-'));
    const output = join(dir, 'github-output');
    await expect(runProbe(credentials(stub), { GITHUB_OUTPUT: output })).rejects.toThrow(
      ProbeError,
    );
    expect(readFileSync(output, 'utf8')).toBe(`refresh_token=${ROTATED_TOKEN}\n`);
  });

  it('reads the last event of an SSE stream', () => {
    const body = rpcBody(
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n',
      'text/event-stream',
    );
    expect(body).toStrictEqual({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
  });

  it('mcpCall reports an MCP error by code, never the body', async () => {
    const stub = await startStubOrigin((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            isError: true,
            content: [{ type: 'text', text: 'no' }],
            structuredContent: { error: { code: 'NOT_FOUND', message: 'nothing' } },
          },
        }),
      );
    });
    stubs.push(stub);
    await expect(mcpCall(stub.url, 'token', 'tools/call', {})).rejects.toThrow('code NOT_FOUND');
  });

  it('writes the rotated token to $GITHUB_OUTPUT, never to the log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'probe-'));
    const output = join(dir, 'github-output');
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(String(line)));
    emitRotatedToken('brand-new-token', { GITHUB_OUTPUT: output });
    expect(readFileSync(output, 'utf8')).toBe('refresh_token=brand-new-token\n');
    expect(logged.join('\n')).not.toContain('brand-new-token');
  });

  it('runs as a CLI against any origin', async () => {
    const stub = await startProbeOrigin();
    const dir = mkdtempSync(join(tmpdir(), 'probe-cli-'));
    const output = join(dir, 'github-output');
    const { stdout } = await run(
      join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
      ['scripts/probe.ts', '--origin', stub.url],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PROBE_CLIENT_ID: 'probe-client',
          PROBE_REFRESH_TOKEN: 'stored',
          GITHUB_OUTPUT: output,
        },
        timeout: 60_000,
      },
    );
    expect(stdout).toContain('probe: passed');
    expect(stdout).not.toContain(ROTATED_TOKEN);
    expect(readFileSync(output, 'utf8')).toBe(`refresh_token=${ROTATED_TOKEN}\n`);
  }, 90_000);
});
