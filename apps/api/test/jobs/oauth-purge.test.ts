import { Hono } from 'hono';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Agent } from '../../src/auth/agent';
import { purgeOAuthArtifacts } from '../../src/db/oauth-purge';
import {
  agentConnection,
  oauthAccessToken,
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  verification,
} from '../../src/db/schema';
import { dailyJob } from '../../src/jobs/daily';
import type { AppEnv } from '../../src/lib/context';
import {
  FIXED_NOW,
  USER_A,
  createTestDatabase,
  ensureAccount,
  type TestDatabase,
} from '../isolation/harness';

/**
 * The daily OAuth sweep (architecture §6.2, §9.3; security review L-4): DCR/CIMD clients unused
 * for 30 days, `oauth_client_resource` rows whose client is gone, expired authorization codes and
 * access tokens, revoked or expired refresh tokens, and consents with no client — each class in
 * its own transaction and the run's response as counts only. Clocks are fixed: NOW is
 * 2026-08-01T10:00:00Z, so the window opens 2026-07-02T10:00:00Z.
 */
let db: TestDatabase;

const NOW = FIXED_NOW;
const DAY = 24 * 60 * 60_000;
const MCP_RESOURCE = 'http://localhost:5173/mcp';

let serial = 0;
let connections = 0;

/** A fresh id, so every row in a test is distinct. */
function next(prefix: string): string {
  serial += 1;
  return `${prefix}_${serial}`;
}

/** `days` before NOW. */
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

/** A client's `client_id`, unique unless `options.clientId` names one. */
async function addClient(
  updatedAt: Date | null,
  options: {
    clientId?: string;
    name?: string;
    clientDiscoveryId?: string | null;
    createdAt?: Date | null;
  } = {},
): Promise<string> {
  const clientId = options.clientId ?? `https://agent.example/${next('client')}.json`;
  await db.appDb.insert(oauthClient).values({
    id: next('oc'),
    clientId,
    name: options.name ?? 'Fictional agent',
    clientDiscoveryId: options.clientDiscoveryId ?? null,
    redirectUris: ['https://agent.example/callback'],
    createdAt: options.createdAt === undefined ? updatedAt : options.createdAt,
    updatedAt,
  });
  return clientId;
}

/** An unrevoked or revoked agent connection for `clientId`. */
async function addConnection(clientId: string, revokedAt: Date | null = null): Promise<string> {
  connections += 1;
  const id = `con_01K1G4KX00AA${String(connections).padStart(2, '0')}${'A'.repeat(12)}`;
  await db.appDb.insert(agentConnection).values({
    id,
    userId: USER_A,
    clientId,
    clientName: 'Fictional agent',
    registration: 'cimd',
    client: 'other',
    createdAt: NOW,
    revokedAt,
  });
  return id;
}

async function addAccessToken(clientId: string, expiresAt: Date): Promise<string> {
  const id = next('oat');
  await db.appDb.insert(oauthAccessToken).values({
    id,
    token: `access-${id}`,
    clientId,
    userId: USER_A,
    expiresAt,
    createdAt: NOW,
    scopes: ['ledger.read'],
  });
  return id;
}

async function addRefreshToken(
  clientId: string,
  expiresAt: Date,
  revoked: Date | null = null,
): Promise<string> {
  const id = next('ort');
  await db.appDb.insert(oauthRefreshToken).values({
    id,
    token: `refresh-${id}`,
    clientId,
    userId: USER_A,
    expiresAt,
    createdAt: NOW,
    revoked,
    scopes: ['ledger.read', 'ledger.write'],
  });
  return id;
}

async function addConsent(clientId: string, referenceId: string | null): Promise<string> {
  const id = next('ocn');
  await db.appDb.insert(oauthConsent).values({
    id,
    clientId,
    userId: USER_A,
    referenceId,
    scopes: ['ledger.read', 'ledger.write'],
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

async function addCode(expiresAt: Date): Promise<string> {
  const id = next('ver');
  await db.appDb.insert(verification).values({
    id,
    identifier: `code-${id}`,
    value: JSON.stringify({ type: 'authorization_code', userId: USER_A, referenceId: null }),
    expiresAt,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

/** The `client_id`s stored, sorted. */
async function clientIds(): Promise<string[]> {
  const { rows } = await db.owner.query<{ client_id: string }>(
    'select client_id from core.oauth_client order by client_id',
  );
  return rows.map((row) => row.client_id);
}

/** Whether a row with `id` is still in `table`. */
async function exists(table: string, id: string): Promise<boolean> {
  const { rows } = await db.owner.query(`select 1 from ${table} where id = $1`, [id]);
  return rows.length === 1;
}

/**
 * Runs `fn` with foreign keys not enforced, as the owner: the only way to make the orphans the
 * sweep's backstops cover, which Postgres otherwise refuses to store. A throwaway test database,
 * so the rows the sweep leaves are fine.
 */
async function withoutForeignKeys(fn: (client: PoolClient) => Promise<void>) {
  const client = await db.owner.connect();
  try {
    await client.query('begin');
    await client.query('set local session_replication_role = replica');
    await fn(client);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  await ensureAccount(db, USER_A);
}, 60_000);

beforeEach(async () => {
  await db.owner.query(
    `truncate core.oauth_access_token, core.oauth_refresh_token, core.oauth_consent,
       core.oauth_client_resource, core.oauth_client, core.oauth_resource, core.verification,
       core.agent_connection`,
  );
});

afterAll(async () => {
  await db?.close();
});

describe('purgeOAuthArtifacts: clients', () => {
  it('deletes DCR and CIMD clients unused for 30 days, a guide’s among them, and keeps newer ones', async () => {
    const old = await addClient(daysAgo(31));
    const boundary = await addClient(daysAgo(30));
    const recent = await addClient(daysAgo(29));
    const guide = await addClient(daysAgo(31), {
      clientId: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
      name: 'Claude',
      clientDiscoveryId: 'cimd',
    });
    const createdOnly = await addClient(null, { createdAt: daysAgo(31) });

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.clients).toBe(4);
    expect(await clientIds()).toStrictEqual([recent]);
    for (const gone of [old, boundary, guide, createdOnly])
      expect(await clientIds()).not.toContain(gone);
  });

  it('keeps a client that still has an unexpired token or a live connection’s consent', async () => {
    const withAccess = await addClient(daysAgo(40));
    const access = await addAccessToken(withAccess, new Date(NOW.getTime() + 60 * 60_000));
    const withRefresh = await addClient(daysAgo(40));
    const refresh = await addRefreshToken(withRefresh, new Date(NOW.getTime() + 30 * DAY));
    const withConsent = await addClient(daysAgo(40));
    const connection = await addConnection(withConsent);
    const consent = await addConsent(withConsent, connection);

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts).toStrictEqual({
      clients: 0,
      clientResources: 0,
      codes: 0,
      accessTokens: 0,
      refreshTokens: 0,
      consents: 0,
    });
    expect(new Set(await clientIds())).toStrictEqual(
      new Set([withAccess, withConsent, withRefresh]),
    );
    expect(await exists('core.oauth_access_token', access)).toBe(true);
    expect(await exists('core.oauth_refresh_token', refresh)).toBe(true);
    expect(await exists('core.oauth_consent', consent)).toBe(true);
  });

  it('deletes an old client whose tokens all expired this run', async () => {
    const clientId = await addClient(daysAgo(40));
    await addAccessToken(clientId, daysAgo(1));

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.accessTokens).toBe(1);
    expect(counts.clients).toBe(1);
    expect(await clientIds()).toStrictEqual([]);
  });

  it('leaves a client with no timestamps alone: nothing says it is unused', async () => {
    const clientId = await addClient(null, { createdAt: null });

    expect((await purgeOAuthArtifacts(db.appDb, NOW)).clients).toBe(0);
    expect(await clientIds()).toStrictEqual([clientId]);
  });
});

describe('purgeOAuthArtifacts: tokens and codes', () => {
  it('deletes expired codes and access tokens, and revoked or expired refresh tokens', async () => {
    const clientId = await addClient(daysAgo(1));
    const expiredCode = await addCode(daysAgo(0.01));
    const liveCode = await addCode(new Date(NOW.getTime() + 5 * 60_000));
    const reset = next('ver');
    await db.appDb.insert(verification).values({
      id: reset,
      identifier: 'reset-password:token',
      value: USER_A,
      expiresAt: daysAgo(1),
      createdAt: NOW,
      updatedAt: NOW,
    });
    const expiredToken = await addAccessToken(clientId, daysAgo(0.01));
    const liveToken = await addAccessToken(clientId, new Date(NOW.getTime() + 60 * 60_000));
    const revokedRefresh = await addRefreshToken(
      clientId,
      new Date(NOW.getTime() + 30 * DAY),
      daysAgo(2),
    );
    const expiredRefresh = await addRefreshToken(clientId, daysAgo(1));
    const liveRefresh = await addRefreshToken(clientId, new Date(NOW.getTime() + 30 * DAY));

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.codes).toBe(1);
    expect(counts.accessTokens).toBe(1);
    expect(counts.refreshTokens).toBe(2);
    expect(await exists('core.verification', expiredCode)).toBe(false);
    expect(await exists('core.verification', liveCode)).toBe(true);
    expect(await exists('core.verification', reset)).toBe(true);
    expect(await exists('core.oauth_access_token', expiredToken)).toBe(false);
    expect(await exists('core.oauth_access_token', liveToken)).toBe(true);
    expect(await exists('core.oauth_refresh_token', revokedRefresh)).toBe(false);
    expect(await exists('core.oauth_refresh_token', expiredRefresh)).toBe(false);
    expect(await exists('core.oauth_refresh_token', liveRefresh)).toBe(true);
  });
});

describe('purgeOAuthArtifacts: orphans', () => {
  it('deletes client resources and consents whose client is gone, and keeps those it still has', async () => {
    await db.appDb.insert(oauthResource).values({
      id: next('ores'),
      identifier: MCP_RESOURCE,
      name: 'NetNet MCP',
    });
    const keptClient = await addClient(daysAgo(1));
    const keptResource = next('ocr');
    await db.appDb.insert(oauthClientResource).values({
      id: keptResource,
      clientId: keptClient,
      resourceId: MCP_RESOURCE,
      createdAt: NOW,
    });
    const connection = await addConnection(keptClient);
    const keptConsent = await addConsent(keptClient, connection);

    const orphanClient = await addClient(daysAgo(1));
    const orphanResource = next('ocr');
    await db.appDb.insert(oauthClientResource).values({
      id: orphanResource,
      clientId: orphanClient,
      resourceId: MCP_RESOURCE,
      createdAt: NOW,
    });
    const orphanConsent = next('ocn');
    await withoutForeignKeys(async (owner) => {
      await owner.query('delete from core.oauth_client where client_id = $1', [orphanClient]);
      await owner.query(
        `insert into core.oauth_consent (id, client_id, reference_id, scopes, created_at, updated_at)
         values ($1, $2, null, $3, $4, $4)`,
        [orphanConsent, 'https://gone.example/client.json', ['ledger.read'], NOW],
      );
    });

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts).toStrictEqual({
      clients: 0,
      clientResources: 1,
      codes: 0,
      accessTokens: 0,
      refreshTokens: 0,
      consents: 1,
    });
    expect(await exists('core.oauth_client_resource', orphanResource)).toBe(false);
    expect(await exists('core.oauth_client_resource', keptResource)).toBe(true);
    expect(await exists('core.oauth_consent', orphanConsent)).toBe(false);
    expect(await exists('core.oauth_consent', keptConsent)).toBe(true);
  });

  it('deletes a consent whose connection is gone, leaving the live one', async () => {
    const clientId = await addClient(daysAgo(1));
    const connection = await addConnection(clientId);
    const live = await addConsent(clientId, connection);
    const orphan = await addConsent(clientId, 'con_01K1G4KX00ZZZZZZZZZZZZZZZZ');

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.consents).toBe(1);
    expect(await exists('core.oauth_consent', orphan)).toBe(false);
    expect(await exists('core.oauth_consent', live)).toBe(true);
  });
});

describe('purgeOAuthArtifacts: live connections', () => {
  it('keeps a live connection’s client, tokens and consent; a revoked connection protects nothing', async () => {
    const liveClient = await addClient(daysAgo(400));
    const liveConnection = await addConnection(liveClient);
    const access = await addAccessToken(liveClient, new Date(NOW.getTime() + 60 * 60_000));
    const refresh = await addRefreshToken(liveClient, new Date(NOW.getTime() + 30 * DAY));
    const consent = await addConsent(liveClient, liveConnection);
    const revokedClient = await addClient(daysAgo(400));
    await addConnection(revokedClient, daysAgo(399));

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.clients).toBe(1);
    expect(await clientIds()).toStrictEqual([liveClient]);
    expect(await exists('core.oauth_access_token', access)).toBe(true);
    expect(await exists('core.oauth_refresh_token', refresh)).toBe(true);
    expect(await exists('core.oauth_consent', consent)).toBe(true);
  });

  it('keeps a live connection’s client even when its last token has expired', async () => {
    const clientId = await addClient(daysAgo(400));
    await addConnection(clientId);
    await addRefreshToken(clientId, daysAgo(1));

    const counts = await purgeOAuthArtifacts(db.appDb, NOW);

    expect(counts.refreshTokens).toBe(1);
    expect(counts.clients).toBe(0);
    expect(await clientIds()).toStrictEqual([clientId]);
  });
});

describe('GET /api/cron/daily', () => {
  it('reports one count per class, numbers only, and deletes every seeded class', async () => {
    await db.appDb.insert(oauthResource).values({
      id: next('ores'),
      identifier: MCP_RESOURCE,
      name: 'NetNet MCP',
    });
    await addClient(daysAgo(31));
    const tokenClient = await addClient(daysAgo(1));
    await addAccessToken(tokenClient, daysAgo(1));
    const refreshClient = await addClient(daysAgo(1));
    await addRefreshToken(refreshClient, new Date(NOW.getTime() + 30 * DAY), daysAgo(2));
    await addCode(daysAgo(1));
    await withoutForeignKeys(async (owner) => {
      await owner.query(
        'insert into core.oauth_client_resource (id, client_id, resource_id, created_at) values ($1, $2, $3, $4)',
        [next('ocr'), 'https://gone.example/client.json', MCP_RESOURCE, NOW],
      );
      await owner.query(
        `insert into core.oauth_consent (id, client_id, reference_id, scopes, created_at, updated_at)
         values ($1, $2, null, $3, $4, $4)`,
        [next('ocn'), 'https://gone.example/client.json', ['ledger.read'], NOW],
      );
    });

    const agent = { attempts: { sweep: () => Promise.resolve(0) } } as unknown as Agent;
    const app = new Hono<AppEnv>().get(
      '/api/cron/daily',
      dailyJob(
        () => agent,
        () => Promise.resolve(0),
        () => purgeOAuthArtifacts(db.appDb, NOW),
      ),
    );
    const res = await app.request('/api/cron/daily');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toStrictEqual({
      attemptsFailed: 0,
      saltsDeleted: 0,
      oauthPurged: {
        clients: 1,
        clientResources: 1,
        codes: 1,
        accessTokens: 1,
        refreshTokens: 1,
        consents: 1,
      },
    });
    // Counts only: no id, name, address or URL from the rows reaches the response.
    for (const value of Object.values(
      (JSON.parse(text) as { oauthPurged: Record<string, unknown> }).oauthPurged,
    )) {
      expect(typeof value).toBe('number');
    }
    for (const personal of [
      USER_A,
      'Fictional agent',
      'agent.example',
      'gone.example',
      tokenClient,
    ]) {
      expect(text).not.toContain(personal);
    }
    expect(await clientIds()).toStrictEqual([tokenClient, refreshClient]);
  });
});
