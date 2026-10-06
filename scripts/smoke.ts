/**
 * `pnpm smoke --origin <url>`: the post-deploy checks (`deploy.yml` runs this against
 * production; it runs against any origin, including a local one).
 *
 * Always: `/api/health`, the OAuth metadata, `/mcp` without a token (401 with the resource
 * metadata), and the security headers on `/`, `/app` and an API response. With
 * `PROBE_CLIENT_ID` and `PROBE_REFRESH_TOKEN` set, also the probe's authenticated path
 * (`tools/list` and `get_financial_context`), rotating the token exactly as the probe does —
 * the caller stores the `refresh_token` in `$GITHUB_OUTPUT` back as the secret. Without them
 * the authenticated checks are skipped, loudly.
 *
 * `SMOKE_FORCE_FAIL=1` fails after the unauthenticated checks: the deploy workflow's
 * `prove_rollback` input uses it to prove the rollback once.
 */
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import {
  emitRotatedToken,
  mcpCall,
  readCredentials,
  refreshAccessToken,
  type ProbeCredentials,
} from './probe';

const TIMEOUT_MS = 30_000;

export class SmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeError';
  }
}

function fail(message: string): never {
  throw new SmokeError(message);
}

async function get(origin: string, path: string): Promise<Response> {
  return fetch(`${origin}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** `/api/health`: 200, `{ok: true}`, and never cached. */
export async function checkHealth(origin: string): Promise<void> {
  const res = await get(origin, '/api/health');
  if (res.status !== 200) fail(`/api/health answered HTTP ${res.status}.`);
  const body = (await res.json().catch(() => ({}))) as { ok?: unknown };
  if (body.ok !== true) fail('/api/health did not answer {ok: true}.');
  console.log('smoke /api/health: ok');
}

/** The OAuth metadata both clients and agents discover us through. */
export async function checkMetadata(origin: string): Promise<void> {
  const server = await get(origin, '/.well-known/oauth-authorization-server');
  if (server.status !== 200) fail(`the authorization server metadata is HTTP ${server.status}.`);
  const serverBody = (await server.json()) as { issuer?: unknown; registration_endpoint?: unknown };
  if (serverBody.issuer !== origin) fail('the metadata issuer is not this origin.');
  if (typeof serverBody.registration_endpoint !== 'string') {
    fail('the metadata has no registration_endpoint.');
  }
  const resource = await get(origin, '/.well-known/oauth-protected-resource');
  if (resource.status !== 200) fail(`the protected resource metadata is HTTP ${resource.status}.`);
  const resourceBody = (await resource.json()) as {
    resource?: unknown;
    authorization_servers?: unknown;
  };
  if (resourceBody.resource !== `${origin}/mcp`)
    fail('the resource metadata names the wrong resource.');
  if (!Array.isArray(resourceBody.authorization_servers)) {
    fail('the resource metadata names no authorization server.');
  }
  console.log('smoke metadata: ok');
}

/** `/mcp` without a token: 401, challenging with the resource metadata. */
export async function checkMcpChallenge(origin: string): Promise<void> {
  const res = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status !== 401) fail(`/mcp without a token answered HTTP ${res.status}, not 401.`);
  const challenge = res.headers.get('WWW-Authenticate') ?? '';
  const metadata = `${origin}/.well-known/oauth-protected-resource`;
  if (!challenge.includes('Bearer') || !challenge.includes(`resource_metadata="${metadata}"`)) {
    fail('/mcp without a token did not challenge with the resource metadata.');
  }
  console.log('smoke /mcp challenge: ok');
}

const EXPECTED_HEADERS: { name: string; contains: string[] }[] = [
  { name: 'Strict-Transport-Security', contains: ['max-age=63072000', 'includeSubDomains'] },
  { name: 'X-Content-Type-Options', contains: ['nosniff'] },
  { name: 'Referrer-Policy', contains: ['strict-origin-when-cross-origin'] },
  {
    name: 'Content-Security-Policy',
    contains: ["default-src 'self'", "frame-ancestors 'none'", 'ingest.sentry.io'],
  },
  { name: 'X-Frame-Options', contains: ['DENY'] },
];

/** Every security header, on a page and on an API response. */
export async function checkSecurityHeaders(origin: string): Promise<void> {
  for (const path of ['/', '/app']) {
    const res = await get(origin, path);
    if (res.status !== 200) fail(`${path} answered HTTP ${res.status}.`);
    for (const { name, contains } of EXPECTED_HEADERS) {
      const value = res.headers.get(name) ?? '';
      for (const part of contains) {
        if (!value.includes(part)) fail(`${path} is missing ${name} (${part}).`);
      }
    }
    console.log(`smoke headers ${path}: ok`);
  }
  const api = await get(origin, '/api/health');
  if (api.headers.get('Cache-Control') !== 'private, no-store') {
    fail('/api/health is not private, no-store.');
  }
  console.log('smoke headers /api/health: ok');
}

/**
 * The probe's authenticated path: `tools/list` and `get_financial_context`. The rotated token
 * is emitted the moment refresh succeeds, before the MCP calls: even a failed smoke run must
 * preserve it, or the probe's family is bricked.
 */
export async function checkAuthenticated(
  credentials: ProbeCredentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const { accessToken, refreshToken } = await refreshAccessToken(credentials);
  emitRotatedToken(refreshToken, env);
  const listed = await mcpCall(credentials.origin, accessToken, 'tools/list', {});
  const tools = (
    ((listed.body.result as { tools?: unknown } | undefined)?.tools as
      { name?: unknown }[] | undefined) ?? []
  ).map((tool) => String(tool.name));
  if (!tools.includes('get_financial_context')) {
    fail('tools/list does not include get_financial_context.');
  }
  console.log(`smoke tools/list: ok (${tools.length} tools)`);
  const context = await mcpCall(credentials.origin, accessToken, 'tools/call', {
    name: 'get_financial_context',
    arguments: {},
  });
  console.log(
    `smoke get_financial_context: ok client_ms=${context.call.clientMs} ` +
      `server_ms=${context.call.serverMs ?? '?'} request_id=${context.call.requestId ?? '?'}`,
  );
  return refreshToken;
}

function hasProbeSecrets(env: NodeJS.ProcessEnv): boolean {
  return env.PROBE_CLIENT_ID !== undefined && env.PROBE_REFRESH_TOKEN !== undefined;
}

function originFromArgs(argv: string[], env: NodeJS.ProcessEnv): string | undefined {
  const flag = argv.indexOf('--origin');
  const fromFlag = flag === -1 ? undefined : argv[flag + 1];
  const origin = fromFlag ?? env.SMOKE_ORIGIN;
  return origin?.replace(/\/$/, '');
}

async function main(): Promise<void> {
  // GitHub's runners sometimes need longer than Node's 250 ms to reach Singapore (spike Q6).
  setDefaultAutoSelectFamilyAttemptTimeout(2000);
  try {
    const origin = originFromArgs(process.argv.slice(2), process.env);
    if (origin === undefined) throw new SmokeError('Usage: pnpm smoke --origin <url>.');
    await checkHealth(origin);
    await checkMetadata(origin);
    await checkMcpChallenge(origin);
    await checkSecurityHeaders(origin);
    if (process.env.SMOKE_FORCE_FAIL === '1') {
      throw new SmokeError('forced failure (SMOKE_FORCE_FAIL=1): proving the rollback.');
    }
    if (hasProbeSecrets(process.env)) {
      await checkAuthenticated(readCredentials({ ...process.env, PROBE_ORIGIN: origin }));
    } else {
      console.log('smoke authenticated: SKIPPED (no PROBE_CLIENT_ID / PROBE_REFRESH_TOKEN)');
    }
    console.log('smoke: passed');
  } catch (error) {
    console.error(`smoke: FAILED ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]?.endsWith('smoke.ts') ?? false;
if (invoked) await main();
