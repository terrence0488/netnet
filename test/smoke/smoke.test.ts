import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAuthenticated,
  checkHealth,
  checkMcpChallenge,
  checkMetadata,
  checkSecurityHeaders,
  SmokeError,
} from '../../scripts/smoke';
import { json, startStubOrigin, type StubOrigin } from '../support/http-stub';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const run = promisify(execFile);

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' https://o1.ingest.sentry.io; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};

let stubs: StubOrigin[] = [];

afterEach(async () => {
  for (const stub of stubs) await stub.close();
  stubs = [];
  vi.restoreAllMocks();
});

async function startSmokeOrigin(options: { breakHeader?: string; healthy?: boolean } = {}) {
  const stub = await startStubOrigin((req, res) => {
    if (req.path === '/api/health') {
      if (options.healthy === false) {
        json(res, 500, { error: { code: 'INTERNAL' } });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.path === '/.well-known/oauth-authorization-server') {
      json(res, 200, {
        issuer: stubUrl(),
        registration_endpoint: `${stubUrl()}/api/auth/oauth2/register`,
      });
      return;
    }
    if (req.path === '/.well-known/oauth-protected-resource') {
      json(res, 200, { resource: `${stubUrl()}/mcp`, authorization_servers: [stubUrl()] });
      return;
    }
    if (req.path === '/mcp') {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${stubUrl()}/.well-known/oauth-protected-resource"`,
      });
      res.end(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }));
      return;
    }
    if (req.path === '/' || req.path === '/app') {
      const headers = { ...SECURITY_HEADERS };
      if (options.breakHeader !== undefined)
        delete headers[options.breakHeader as keyof typeof headers];
      res.writeHead(200, { 'Content-Type': 'text/html', ...headers });
      res.end('<html></html>');
      return;
    }
    if (req.method === 'POST' && req.path === '/api/auth/oauth2/token') {
      json(res, 200, {
        access_token: 'smoke-access',
        refresh_token: 'smoke-rotated',
        expires_in: 3600,
      });
      return;
    }
    json(res, 404, { error: { code: 'NOT_FOUND' } });
  });
  const stubUrl = () => stub.url;
  stubs.push(stub);
  return stub;
}

describe('scripts/smoke', () => {
  it('passes health, metadata, the MCP challenge and the headers', async () => {
    const stub = await startSmokeOrigin();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await checkHealth(stub.url);
    await checkMetadata(stub.url);
    await checkMcpChallenge(stub.url);
    await checkSecurityHeaders(stub.url);
  });

  it('fails when health is down', async () => {
    const stub = await startSmokeOrigin({ healthy: false });
    await expect(checkHealth(stub.url)).rejects.toThrow(SmokeError);
  });

  it('fails when a security header is missing', async () => {
    const stub = await startSmokeOrigin({ breakHeader: 'Content-Security-Policy' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(checkSecurityHeaders(stub.url)).rejects.toThrow(
      '/ is missing Content-Security-Policy',
    );
  });

  it('runs the authenticated path and hands back the rotated token', async () => {
    const stub = await startStubOrigin((req, res) => {
      if (req.path === '/api/auth/oauth2/token') {
        json(res, 200, { access_token: 'a', refresh_token: 'rotated-here', expires_in: 3600 });
        return;
      }
      const body = JSON.parse(req.body) as { method?: unknown };
      const result =
        body.method === 'tools/list'
          ? { tools: [{ name: 'get_financial_context' }] }
          : { content: [], structuredContent: {} };
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Server-Timing': 'netnet;dur=9',
        'X-Request-Id': 'req_smoke1',
      });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
    });
    stubs.push(stub);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rotated = await checkAuthenticated(
      {
        origin: stub.url,
        clientId: 'probe-client',
        refreshToken: 'stored',
      },
      {},
    );
    expect(rotated).toBe('rotated-here');
  });

  it.each([
    ['unset', { PROBE_CLIENT_ID: undefined, PROBE_REFRESH_TOKEN: undefined }],
    // A missing GitHub secret reaches the step as '', not unset (first deploy).
    ['empty', { PROBE_CLIENT_ID: '', PROBE_REFRESH_TOKEN: '' }],
  ])(
    'runs as a CLI against any origin, skipping auth when secrets are %s',
    async (_label, probeEnv: Record<string, string | undefined>) => {
      const stub = await startSmokeOrigin();
      const { stdout } = await run(
        join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
        ['scripts/smoke.ts', '--origin', stub.url],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, ...probeEnv },
          timeout: 60_000,
        },
      );
      expect(stdout).toContain('smoke: passed');
      expect(stdout).toContain('SKIPPED');
    },
    90_000,
  );

  it('force-fails for the rollback proof, and the CLI reports failures', async () => {
    const stub = await startSmokeOrigin();
    const dir = mkdtempSync(join(tmpdir(), 'smoke-cli-'));
    const failing = await run(
      join(REPO_ROOT, 'node_modules', '.bin', 'tsx'),
      ['scripts/smoke.ts', '--origin', stub.url],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, SMOKE_FORCE_FAIL: '1', GITHUB_OUTPUT: join(dir, 'out') },
        timeout: 60_000,
      },
    ).then(
      () => 'exit 0',
      (error: NodeJS.ErrnoException & { stderr?: string }) => String(error.stderr ?? error.message),
    );
    expect(failing).toContain('smoke: FAILED');
    expect(failing).toContain('forced failure');
  }, 90_000);
});
