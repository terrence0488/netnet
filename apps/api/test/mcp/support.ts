import type { Countries, VersionedPack } from '@netnet/contracts';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { AddressInfo } from 'node:net';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { expect } from 'vitest';
import type { Client } from '../../src/auth/classify';
import { createVerifyAccessToken, type VerifyAccessToken } from '../../src/auth/mcp-token';
import { createFx } from '../../src/content/fx';
import { COUNTRIES_KEY } from '../../src/content/publish';
import { createContentStore, type ContentSource } from '../../src/content/store';
import { createAuth, type Auth } from '../../src/auth/auth';
import { createAgent, type Agent } from '../../src/auth/agent';
import { wellKnownRoutes } from '../../src/auth/oauth-routes';
import { originCheck } from '../../src/auth/origin-check';
import { authRoutes } from '../../src/auth/routes';
import { sessionFromCookie } from '../../src/auth/session';
import { eventStore } from '../../src/db/analytics';
import type { ContentRef } from '../../src/db/content';
import { ensureProfile } from '../../src/db/profiles';
import { countHit } from '../../src/db/rate-limits';
import {
  countReminderEmailsToday,
  getReminderState,
  recordReminderSent,
} from '../../src/db/reminders';
import { createTrack } from '../../src/events/track';
import { agentRoutes } from '../../src/http/agent';
import { holdingsRoutes } from '../../src/http/holdings';
import type { LedgerDeps } from '../../src/http/ledger-edge';
import { ledgerCountryChange, ledgerCurrencyChange, ledgerInit, meRoutes } from '../../src/http/me';
import { prefsRoutes } from '../../src/http/prefs';
import { snapshotRoutes } from '../../src/http/snapshot';
import { tagsRoutes } from '../../src/http/tags';
import { typesRoutes } from '../../src/http/types';
import { valuesRoutes } from '../../src/http/values';
import { baseCurrencyOf } from '../../src/ledger/base-currency';
import { ledgerContent } from '../../src/ledger/content';
import type { AppEnv } from '../../src/lib/context';
import { handleError, handleNotFound } from '../../src/lib/error-handler';
import { createRateLimit } from '../../src/lib/rate-limit';
import { noStore, requestContext } from '../../src/lib/request-context';
import { sessionContext } from '../../src/lib/session';
import { mcpRoutes } from '../../src/mcp/route';
import type { McpDeps } from '../../src/mcp/deps';
import { REMINDER_EMAILS_PER_DAY, createNotify } from '../../src/notify/notify';
import { accountOf } from '../../src/db/profiles';
import { captureChannel } from '../../src/notify/email';
import { signReminderToken } from '../../src/notify/links';
import { FIXED_NOW, type TestDatabase } from '../isolation/harness';
import { COUNTRY_V1, GENERIC_V1, fakeRates, newUserId } from '../ledger/support';
import { FakeMetadataServer } from '../support/cimd-server';
import { captureWaitUntil } from '../support/wait-until';

/**
 * The MCP suites' app: auth, agent and ledger routes plus `/mcp`, over a test database, fictional
 * content in memory (an imaginary country "QZ" with pack "qz", generic, and Claude/ChatGPT
 * guides), fake rates, and events written to the test database. Tokens are minted two ways: fast
 * ones, signed here with a local key for a connection row the test inserts; and real ones, through
 * the full OAuth flow against the test auth server. Every name and figure is made up
 * (CONVENTIONS §6).
 */

/** Where the fictional web app runs. */
export const ORIGIN = 'http://localhost:5173';

/** The header a test names its signed-in REST user with. Only this test app reads it. */
const TEST_USER = 'x-test-user';

/** A test-only secret: 32 bytes of nothing in particular. */
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

/** A test-only link-signing secret for the reminder's tokens. */
const LINK_SECRET = 'test-link-secret-0123456789abcdef';

export const COUNTRIES: Countries = {
  QZ: { currency: 'EUR', pack: 'qz' },
  GB: { currency: 'GBP' },
  US: { currency: 'USD' },
};

/** Generic's setup checklist: the basics every country starts from. */
const GENERIC_GUIDE: VersionedPack = {
  ...GENERIC_V1,
  checklist: [
    {
      id: 'everyday',
      u: 'cash',
      name: 'Everyday money',
      ask: 'Where is the money you spend day to day?',
      amount: 'How much is there right now?',
    },
    {
      id: 'home',
      u: 'property',
      name: 'Home',
      ask: 'Do you own a home?',
      amount: 'What is it worth?',
    },
  ],
};

/** The imaginary country's checklist: only what differs from generic. */
const QZ_GUIDE: VersionedPack = {
  ...COUNTRY_V1,
  checklist: [
    {
      id: 'motor',
      u: 'loan',
      type: 'auto_loan',
      name: 'Motor loan',
      ask: 'Do you have a motor loan?',
      amount: 'How much is owed?',
    },
  ],
};

const CLAUDE_GUIDE = { id: 'claude', name: 'Claude' };
const CHATGPT_GUIDE = { id: 'chatgpt', name: 'ChatGPT' };

/** Published content as the store reads it: each document at version 1. */
function memoryContent(): ContentSource {
  const docs = new Map<string, unknown>([
    ['pack/generic@1', GENERIC_GUIDE],
    ['pack/qz@1', QZ_GUIDE],
    [`countries/${COUNTRIES_KEY}@1`, COUNTRIES],
    ['agent/claude@1', CLAUDE_GUIDE],
    ['agent/chatgpt@1', CHATGPT_GUIDE],
  ]);
  const live = new Map<string, ContentRef>(
    [...docs.keys()].map((id) => {
      const [kind = '', rest = ''] = id.split('/');
      const [key = '', version = ''] = rest.split('@');
      return [`${kind}/${key}`, { kind, key, version: Number(version) }];
    }),
  );
  return {
    current: () => Promise.resolve([...live.values()]),
    body: (ref) => Promise.resolve(docs.get(`${ref.kind}/${ref.key}@${ref.version}`)),
  };
}

let connections = 0;

/** A new connection id, unique in this run. */
export function newConnectionId(): string {
  connections += 1;
  return `con_01K1G4KX00CNNN${String(connections).padStart(12, '0')}`;
}

export interface McpTestApp {
  db: TestDatabase;
  app: Hono<AppEnv>;
  auth: Auth;
  agent: Agent;
  cimd: FakeMetadataServer;
  mcp: McpDeps;
  /** Signs a fast token for `userId` on `connectionId` (inserted by `connectAgent`). */
  token(options: {
    userId: string;
    connectionId: string;
    scopes?: string[];
    clientId?: string;
  }): Promise<string>;
  /** The rate limits' clock: tests move it. */
  rateClock: { now: Date };
  /** Awaits the work handed to run after responses: emails, events and touches. */
  settle(): Promise<void>;
  /** Serves the app over HTTP for SDK clients; closes with `close()`. */
  listen(): Promise<{ url: string; close: () => Promise<void> }>;
}

export interface ConnectedAgent {
  userId: string;
  connectionId: string;
  token: string;
}

/**
 * A user with a connection row and a fast token for it. The user row and the ledger are the
 * test's to make (`newPerson` and `/api/me` below, or the fixture's own seeding).
 */
export async function connectAgent(
  target: McpTestApp,
  userId: string,
  options: {
    client?: Client;
    clientName?: string;
    scopes?: string[];
    registration?: 'cimd' | 'dcr';
    clientId?: string;
  } = {},
): Promise<ConnectedAgent> {
  const connectionId = newConnectionId();
  const client = options.client ?? 'other';
  const clientId =
    options.clientId ??
    (client === 'other' ? `dcr-client-${connectionId}` : `https://${client}.example/metadata`);
  await target.db.owner.query(
    `insert into core.agent_connection (id, user_id, client_id, client_name, registration, client, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      connectionId,
      userId,
      clientId,
      options.clientName ?? 'Fictional agent',
      options.registration ?? 'cimd',
      client,
      FIXED_NOW,
    ],
  );
  const token = await target.token({
    userId,
    connectionId,
    ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
    clientId,
  });
  return { userId, connectionId, token };
}

export async function mcpTestApp(
  db: TestDatabase,
  options: {
    verify?: (auth: Auth) => VerifyAccessToken;
    /** `touchChecked` after a `tools/call`; a no-op unless the test passes the real one. */
    touchChecked?: (userId: string) => Promise<void>;
  } = {},
): Promise<McpTestApp> {
  const store = createContentStore({ source: memoryContent(), clock: () => FIXED_NOW.getTime() });
  const fx = createFx(fakeRates());
  const rateClock = { now: FIXED_NOW };
  const pending: Promise<unknown>[] = [];
  const background = (task: Promise<unknown>) => void pending.push(task);
  const afterResponses = captureWaitUntil();
  const track = createTrack(() => ({ store: eventStore(db.appDb), clock: () => FIXED_NOW }));
  const rateLimit = createRateLimit(() => ({
    count: (key, windowStart) => countHit(db.appDb, key, windowStart),
    clock: () => rateClock.now,
  }));
  const cimd = new FakeMetadataServer();
  const emails = captureChannel();
  const notify = createNotify(() => ({
    recipient: (userId) => accountOf(db.appDb, userId),
    email: { id: 'email', send: (to, rendered) => emails.send(to, rendered) },
    origin: ORIGIN,
    reminders: {
      state: (userId) => getReminderState(db.appDb, userId),
      sent: (userId, channel) => recordReminderSent(db.appDb, userId, channel),
      emailBudgetLeft: async () =>
        (await countReminderEmailsToday(db.appDb, FIXED_NOW)) < REMINDER_EMAILS_PER_DAY,
      sign: (userId, channel, sentAt) =>
        signReminderToken(LINK_SECRET, { userId, channel, sentAt }),
    },
  }));
  const auth = createAuth({
    db: db.appDb,
    secret: SECRET,
    origin: ORIGIN,
    trustedOrigins: [ORIGIN],
    notify,
    track,
    appVersion: () => 'test123',
    clock: () => FIXED_NOW,
    background,
    fetchClientMetadata: cimd.fetch,
  });
  const agent = createAgent({
    db: () => db.appDb,
    clock: () => FIXED_NOW,
    track,
    appVersion: () => 'test123',
    background,
    auth: () => auth,
    origin: () => ORIGIN,
    guides: () => Promise.resolve([]),
    withUser: db.withUser,
    notify,
  });
  const ledgerDeps: LedgerDeps = {
    profile: (userId) => ensureProfile(db.appDb, userId),
    withUser: db.withUser,
    options: (profile) => ({
      fx,
      content: ledgerContent(store, profile.country),
      timeZone: profile.timeZone,
    }),
    track,
    appVersion: () => 'test123',
  };

  // Fast tokens, signed here with a local key — unless the test passes the real verifier.
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'mcp-test', alg: 'EdDSA' };
  const fastVerify = createVerifyAccessToken(() => ({
    origin: ORIGIN,
    jwks: createLocalJWKSet({ keys: [jwk] }),
    clock: () => FIXED_NOW,
  }));
  const mcp: McpDeps = {
    verify: options.verify?.(auth) ?? fastVerify,
    db: () => db.appDb,
    withUser: db.withUser,
    profile: (userId) => ensureProfile(db.appDb, userId),
    fx,
    content: () => store,
    rateLimit,
    track,
    appVersion: () => 'test123',
    clock: () => FIXED_NOW,
    origin: () => ORIGIN,
    markLive: (userId, connectionId) => agent.attempts.markLive(userId, connectionId),
    touch: (connectionId) => agent.connections.touch(connectionId),
    touchChecked: options.touchChecked ?? (() => Promise.resolve()),
  };

  const app = new Hono<AppEnv>();
  const cookieSession = sessionFromCookie(() => auth);
  app.use(
    '*',
    requestContext(),
    noStore(),
    originCheck(() => [ORIGIN]),
    sessionContext(async (c) => {
      const userId = c.req.header(TEST_USER);
      if (userId) return { userId, emailVerified: true };
      return cookieSession(c);
    }),
  );
  app.route(
    '/api/auth',
    authRoutes({
      auth: () => auth,
      rateLimit,
      origin: () => ORIGIN,
      agent: () => agent,
      db: () => db.appDb,
    }),
  );
  app.route(
    '/.well-known',
    wellKnownRoutes(() => auth),
  );
  app.route(
    '/api/agent',
    agentRoutes(() => agent),
  );
  app.route(
    '/api/me',
    meRoutes({
      db: () => db.appDb,
      baseCurrency: (userId) => baseCurrencyOf(db.withUser, userId),
      countries: () => Promise.resolve(COUNTRIES),
      initLedger: ledgerInit(db.withUser, ledgerDeps.options),
      changeLedgerCountry: ledgerCountryChange(db.withUser, ledgerDeps.options),
      changeLedgerCurrency: ledgerCurrencyChange(db.withUser, ledgerDeps.options),
    }),
  );
  app.route('/api/snapshot', snapshotRoutes(ledgerDeps));
  app.route('/api/holdings', holdingsRoutes(ledgerDeps));
  app.route('/api', valuesRoutes(ledgerDeps));
  app.route('/api/types', typesRoutes(ledgerDeps));
  app.route('/api/tags', tagsRoutes(ledgerDeps));
  app.route('/api/prefs', prefsRoutes(ledgerDeps));
  app.route('/mcp', mcpRoutes(mcp));
  app.notFound(handleNotFound);
  app.onError(handleError);

  return {
    db,
    app,
    auth,
    agent,
    cimd,
    mcp,
    rateClock,
    async token({ userId, connectionId, scopes, clientId }) {
      const iat = Math.floor(FIXED_NOW.getTime() / 1000) - 60;
      return new SignJWT({
        client_id: clientId ?? 'https://agent.example/metadata',
        scope: (scopes ?? ['ledger.read', 'ledger.write']).join(' '),
        connection_id: connectionId,
      })
        .setProtectedHeader({ alg: 'EdDSA', typ: 'at+jwt', kid: 'mcp-test' })
        .setIssuer(ORIGIN)
        .setAudience(`${ORIGIN}/mcp`)
        .setSubject(userId)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 3600)
        .sign(privateKey);
    },
    async settle() {
      while (pending.length > 0 || afterResponses.pending > 0) {
        await Promise.allSettled(pending.splice(0));
        await afterResponses.settle();
      }
    },
    async listen() {
      const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
        const started = serve({ fetch: app.fetch, port: 0 }, () => resolve(started));
      });
      const { port } = server.address() as AddressInfo;
      return {
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
      };
    },
  };
}

export interface SendOptions {
  headers?: Record<string, string>;
}

/** A JSON-RPC request over `/mcp` as `token` (or nobody, for null). */
export async function mcpRequest(
  target: McpTestApp,
  token: string | null,
  body: unknown,
  options: SendOptions & { protocolVersion?: string; method?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    ...options.headers,
  };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (options.protocolVersion !== undefined) {
    headers['MCP-Protocol-Version'] = options.protocolVersion;
  }
  const method = options.method ?? 'POST';
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  return Promise.resolve(
    target.app.request(`${ORIGIN}/mcp`, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

/** The JSON-RPC body of `res`: plain JSON, or the last event of an SSE stream. */
export async function rpcOf(
  res: Response,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const text = await res.text();
  const contentType = res.headers.get('Content-Type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return {
      status: res.status,
      body: (text === '' ? {} : JSON.parse(text)) as Record<string, unknown>,
    };
  }
  const events = text.split('\n\n').filter((block) => block.includes('data:'));
  const last = events.at(-1) ?? '';
  const data = last
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');
  return { status: res.status, body: JSON.parse(data) as Record<string, unknown> };
}

/** A REST request as `userId` (or nobody, for null). */
export function restRequest(
  target: McpTestApp,
  userId: string | null,
  method: string,
  path: string,
  json?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (userId !== null) headers[TEST_USER] = userId;
  return Promise.resolve(
    target.app.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        ...headers,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    }),
  );
}

/** The JSON body of `res`, after checking its status. */
export async function json<T = Record<string, unknown>>(res: Response, status = 200): Promise<T> {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
}

/** A new account, with nothing set up yet. */
export async function newPerson(target: McpTestApp): Promise<string> {
  const userId = newUserId();
  await target.db.owner.query(`insert into core.user (id, name, email) values ($1, '', $2)`, [
    userId,
    `${userId.toLowerCase()}@example.com`,
  ]);
  return userId;
}

/** A new person who has confirmed `country` (QZ, with its pack, unless given): a ledger exists. */
export async function onboarded(target: McpTestApp, country = 'QZ'): Promise<string> {
  const userId = await newPerson(target);
  await json(await restRequest(target, userId, 'PATCH', '/api/me', { country }));
  return userId;
}

/** The analytics events for `userId`, oldest first. */
export async function eventsOf(
  target: McpTestApp,
  userId: string,
): Promise<{ name: string; props: Record<string, unknown> }[]> {
  const { rows } = await target.db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 order by at, id`,
    [userId],
  );
  return rows;
}

/** All of a user's ledger rows, as the owner sees them. */
export async function ledgerOf(target: McpTestApp, userId: string): Promise<string> {
  const tables = [
    'ledger_state',
    'user_type',
    'tag',
    'holding',
    'holding_tag',
    'batch',
    'value',
    'prefs',
    'audit',
  ];
  const out: Record<string, unknown[]> = {};
  for (const table of tables) {
    const { rows } = await target.db.owner.query(
      `select * from ledger.${table} where user_id = $1 order by 1, 2`,
      [userId],
    );
    out[table] = rows;
  }
  return JSON.stringify(out);
}

/** A `tools/call` result: the text rendering and the structured content. */
export interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

let rpcIds = 0;

/**
 * Calls tool `name` with `args` as `token`, with no handshake: every request is stateless.
 * Returns the result, whether it is an error or not.
 */
export async function callTool(
  target: McpTestApp,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  rpcIds += 1;
  const res = await mcpRequest(target, token, {
    jsonrpc: '2.0',
    id: rpcIds,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  const { status, body } = await rpcOf(res);
  expect(status, JSON.stringify(body)).toBe(200);
  return (body as { result: ToolResult }).result;
}

/** The successful result's `structuredContent`, after checking `isError` is unset. */
export function okOf<T>(result: ToolResult): T {
  expect(result.isError ?? false).toBe(false);
  expect(result.content).toHaveLength(1);
  return result.structuredContent as T;
}

/** The failed result's `error`, after checking `isError` and the code. */
export function errOf(
  result: ToolResult,
  code: string,
): { message: string; fields?: Record<string, string> } & Record<string, unknown> {
  expect(result.isError).toBe(true);
  const error = (
    result.structuredContent as {
      error: { code: string; message: string; fields?: Record<string, string> };
    }
  ).error;
  expect(error.code).toBe(code);
  return error;
}
