import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Agent } from '../../src/auth/agent';
import { hashToken } from '../../src/auth/oauth';
import { codeGrant } from '../../src/db/oauth';
import { agentRoutes } from '../../src/http/agent';
import { accountsApp, type AccountsApp } from '../support/accounts-app';
import { AgentClient, signUpPerson, type Person } from '../support/oauth-client';
import { MARKER_A, MARKER_B, createTestDatabase, type TestDatabase } from './harness';

/**
 * The isolation cases for `/api/agent/*` (architecture §8, CONVENTIONS §9): user B with user A's
 * ids gets `NOT_FOUND` and none of A's data, and nothing of A's changes. A has an attempt, a
 * connection and an approval page waiting; B is signed in and verified.
 */
let db: TestDatabase;
let target: AccountsApp;
let a: Person;
let b: Person;
let attemptA: string;
let connectionA: string;
let pendingQueryA: string;

const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
  a = await signUpPerson(target, db, `${MARKER_A.toLowerCase()}@example.com`);
  b = await signUpPerson(target, db, `${MARKER_B.toLowerCase()}@example.com`);

  const client = AgentClient.cimd(target, CLAUDE, 'Claude');
  await client.connect(a.browser);
  const { rows } = await db.owner.query<{ id: string }>(
    'select id from core.agent_connection where user_id = $1',
    [a.userId],
  );
  connectionA = rows[0]?.id ?? '';
  const started = await a.browser.send('/api/agent/attempts', {
    json: { client: 'claude', entry: 'home', platform: 'computer' },
  });
  attemptA = String(((await started.json()) as { id: string }).id);
  const { location } = await client.authorize(a.browser);
  pendingQueryA = location.search.slice(1);
  await target.settle();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Fails if `body` holds anything of A's. */
function expectNothingOfA(body: string): void {
  expect(body).not.toContain(a.userId);
  expect(body.toLowerCase()).not.toContain(MARKER_A.toLowerCase());
  expect(body).not.toContain(attemptA);
  expect(body).not.toContain(connectionA);
}

async function stateOfA() {
  const attempts = await db.owner.query(
    'select * from core.connection_attempt where user_id = $1 order by id',
    [a.userId],
  );
  const connections = await db.owner.query(
    'select * from core.agent_connection where user_id = $1 order by id',
    [a.userId],
  );
  return { attempts: attempts.rows, connections: connections.rows };
}

/** Every route `agentRoutes` serves, and the case below that attacks it. */
const CASES = [
  'POST /attempts',
  'GET /attempts/:id',
  'GET /connections',
  'DELETE /connections/:id',
  'GET /approval',
  'POST /approval',
];

describe('/api/agent/* as user B', () => {
  it('has an isolation case for every route', () => {
    const served = agentRoutes(() => ({}) as Agent)
      .routes.filter((r) => r.method !== 'ALL')
      .map((r) => `${r.method} ${r.path}`);
    expect([...new Set(served)].sort()).toEqual([...CASES].sort());
  });

  it('POST /attempts: makes B’s own attempt, and refuses a body naming A', async () => {
    const before = await stateOfA();
    const named = await b.browser.send('/api/agent/attempts', {
      json: { client: 'claude', entry: 'home', platform: 'computer', userId: a.userId },
    });
    expect(named.status).toBe(400);
    expectNothingOfA(await named.text());
    const own = await b.browser.send('/api/agent/attempts', {
      json: { client: 'other', entry: 'agent', platform: 'any' },
    });
    expect(own.status).toBe(201);
    const { id } = (await own.json()) as { id: string };
    const { rows } = await db.owner.query(
      'select user_id from core.connection_attempt where id = $1',
      [id],
    );
    expect(rows).toEqual([{ user_id: b.userId }]);
    expect(await stateOfA()).toEqual(before);
  });

  it('GET /attempts/:id with A’s attempt: NOT_FOUND, and A’s attempt is untouched', async () => {
    const before = await stateOfA();
    const res = await b.browser.send(`/api/agent/attempts/${attemptA}`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('NOT_FOUND');
    expectNothingOfA(body);
    expect(await stateOfA()).toEqual(before);
  });

  it('GET /connections: none of A’s', async () => {
    const res = await b.browser.send('/api/agent/connections');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual([]);
    expectNothingOfA(body);
  });

  it('DELETE /connections/:id with A’s connection: NOT_FOUND, and it stays active', async () => {
    const before = await stateOfA();
    const res = await b.browser.send(`/api/agent/connections/${connectionA}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expectNothingOfA(await res.text());
    expect(await stateOfA()).toEqual(before);
    const { rows } = await db.owner.query(
      `select count(*)::int as n from core.oauth_refresh_token where reference_id = $1 and revoked is not null`,
      [connectionA],
    );
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('GET /approval with A’s approval page: only the agent’s request, nothing of A’s', async () => {
    const before = await stateOfA();
    const res = await b.browser.send(`/api/agent/approval?${pendingQueryA}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expectNothingOfA(body);
    expect(JSON.parse(body)).toMatchObject({ clientName: 'Claude', client: 'claude' });
    expect(await stateOfA()).toEqual(before);
  });

  it('POST /approval with A’s approval page: any connection is B’s, never A’s', async () => {
    const before = await stateOfA();
    const res = await b.browser.send('/api/agent/approval', {
      json: { accept: true, query: pendingQueryA },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expectNothingOfA(body);
    expect(await stateOfA()).toEqual(before);

    const code = new URL((JSON.parse(body) as { url: string }).url).searchParams.get('code') ?? '';
    const { rows } = await db.owner.query<{ user_id: string }>(
      'select user_id from core.agent_connection where user_id <> $1',
      [a.userId],
    );
    expect(rows).toEqual([{ user_id: b.userId }]);
    // The code speaks for B: whatever agent started the request gets B's account, never A's.
    expect(await codeGrant(db.appDb, hashToken(code))).toEqual({
      userId: b.userId,
      connectionId: expect.stringMatching(/^con_/) as unknown,
    });
  });
});
