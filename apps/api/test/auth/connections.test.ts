import { agentConnectionSchema, approvalSchema, attemptSchema } from '@netnet/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createVerifyAccessToken, jwksFrom } from '../../src/auth/mcp-token';
import { seedLedger } from '../../src/ledger/seed';
import { ConnectionRevoked } from '../../src/ledger/with-user';
import { UNVERIFIED_NAME } from '../../src/notify/templates/security';
import {
  CONNECTION_A,
  FIXED_NOW,
  createTestDatabase,
  type TestDatabase,
} from '../isolation/harness';
import { CRON_SECRET, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { AgentClient, MCP_URL, signUpPerson, type Person } from '../support/oauth-client';

/**
 * Connecting an agent around the OAuth server (PRD J5, architecture §7.2, §7.6, §7.7, §7.10): the
 * approval page's API, the connection attempt the web app polls with its timeouts, the
 * classification events carry, the security email, the Agent tab's list and revocation.
 */
let db: TestDatabase;
let target: AccountsApp;
let serial = 0;

const MINUTE = 60_000;
const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const CODEX = 'https://chatgpt.com/oauth/codex/client.json';

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

beforeEach(() => {
  target.clock.now = FIXED_NOW;
  target.emailDown.value = false;
});

afterAll(async () => {
  await db?.close();
});

/** A new fictional person for each test, so no attempt of one test is another's. */
function newPerson(options: { verified?: boolean; timeZone?: string } = {}): Promise<Person> {
  serial += 1;
  return signUpPerson(target, db, `agent-person-${serial}@example.com`, options);
}

function later(ms: number): void {
  target.clock.now = new Date(target.clock.now.getTime() + ms);
}

function claude(): AgentClient {
  return AgentClient.cimd(target, CLAUDE, 'Claude');
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function startAttempt(
  person: Person,
  input: Record<string, unknown> = { client: 'claude', entry: 'home', platform: 'computer' },
): Promise<string> {
  const res = await person.browser.send('/api/agent/attempts', { json: input });
  expect(res.status).toBe(201);
  return String((await body(res)).id);
}

async function attempt(person: Person, id: string): Promise<Record<string, unknown>> {
  const res = await person.browser.send(`/api/agent/attempts/${id}`);
  expect(res.status).toBe(200);
  await target.settle();
  const read = await body(res);
  expect(attemptSchema.safeParse(read).success).toBe(true);
  return read;
}

async function events(userId: string, name?: string) {
  await target.settle();
  const { rows } = await db.owner.query<{ name: string; props: Record<string, unknown> }>(
    `select name, props from analytics.event where user_id = $1 ${name ? 'and name = $2' : ''}
      order by id`,
    name ? [userId, name] : [userId],
  );
  return rows;
}

async function connectionsOf(userId: string) {
  const { rows } = await db.owner.query<Record<string, unknown>>(
    'select * from core.agent_connection where user_id = $1 order by created_at, id',
    [userId],
  );
  return rows;
}

function securityEmails(person: Person) {
  return target.emails.captured.filter(
    (e) => e.to === person.email && e.rendered.subject.includes('was connected'),
  );
}

async function cron(path: '/api/cron/daily' | '/api/cron/reminders'): Promise<Response> {
  const res = await target.app.request(`${ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  await target.settle();
  return res;
}

const daily = () => cron('/api/cron/daily');
const reminders = () => cron('/api/cron/reminders');

describe('GET /api/agent/approval', () => {
  it('shows who is asking: the registered name, how it registered, its host and the scopes', async () => {
    const person = await newPerson();
    const { location } = await claude().authorize(person.browser);
    const res = await person.browser.send(`/api/agent/approval${location.search}`);
    expect(res.status).toBe(200);
    const view = await body(res);
    expect(approvalSchema.safeParse(view).success).toBe(true);
    expect(view).toEqual({
      clientName: 'Claude',
      registration: 'cimd',
      nameVerified: true,
      client: 'claude',
      host: 'claude.ai',
      scopes: ['ledger.read', 'ledger.write', 'offline_access'],
    });

    const dcr = await AgentClient.register(target, 'Claude‮ (really)', 'https://agent.example/cb');
    const other = await dcr.authorize(person.browser);
    expect(
      await body(await person.browser.send(`/api/agent/approval${other.location.search}`)),
    ).toMatchObject({
      clientName: 'Claude (really)',
      registration: 'dcr',
      nameVerified: false,
      client: 'other',
      host: 'agent.example',
    });
  });

  it('marks a CIMD document at any other host unverified, and shows that host (M-2)', async () => {
    const person = await newPerson();
    const attacker = AgentClient.cimd(
      target,
      'https://attacker.example/client.json',
      'Claude',
      'https://attacker.example/callback',
    );
    const { location } = await attacker.authorize(person.browser);
    const res = await person.browser.send(`/api/agent/approval${location.search}`);
    expect(res.status).toBe(200);
    const view = await body(res);
    expect(approvalSchema.safeParse(view).success).toBe(true);
    expect(view).toEqual({
      clientName: 'Claude',
      registration: 'cimd',
      nameVerified: false,
      client: 'other',
      host: 'attacker.example',
      scopes: ['ledger.read', 'ledger.write', 'offline_access'],
    });
  });

  it('needs a session, then a verified email', async () => {
    const person = await newPerson({ verified: false });
    const { location } = await claude().authorize(person.browser);
    const res = await person.browser.send(`/api/agent/approval${location.search}`);
    expect(res.status).toBe(403);
    expect(await body(res)).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });

    const { Browser } = await import('../support/accounts-app');
    const nobody = await new Browser(target).send(`/api/agent/approval${location.search}`);
    expect(nobody.status).toBe(401);
  });

  it('refuses a query NetNet did not sign, or one more than 10 minutes old', async () => {
    const person = await newPerson();
    const { location } = await claude().authorize(person.browser);
    const tampered = location.search.replace('ledger.read', 'ledger.writ');
    for (const query of [tampered, '?client_id=x', '']) {
      const res = await person.browser.send(`/api/agent/approval${query}`);
      expect(res.status).toBe(400);
      expect(await body(res)).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('asks for a fresh sign-in when the agent asked for one', async () => {
    const person = await newPerson();
    const { location } = await claude().authorize(person.browser, { prompt: 'login consent' });
    expect(location.pathname).toBe('/app/connect/approve');
    const stale = await person.browser.send(`/api/agent/approval${location.search}`);
    expect(stale.status).toBe(401);
    expect(await body(stale)).toMatchObject({ error: { code: 'REAUTH_REQUIRED' } });

    expect((await person.browser.signIn(person.email, 'correct horse')).status).toBe(200);
    const fresh = await person.browser.send(`/api/agent/approval${location.search}`);
    expect(fresh.status).toBe(200);
    const allowed = await person.browser.send('/api/agent/approval', {
      json: { accept: true, query: location.search.slice(1) },
    });
    expect(new URL(String((await body(allowed)).url)).searchParams.get('code')).toBeTruthy();
  });
});

describe('POST /api/agent/approval', () => {
  it('Allow: makes a classified connection, moves the attempt on, and fires completed', async () => {
    const person = await newPerson();
    const id = await startAttempt(person);
    expect(await attempt(person, id)).toEqual({ id, state: 'started' });

    const { result, url, state } = await claude().approve(person.browser);
    expect(result.status).toBe(200);
    expect(`${url.origin}${url.pathname}`).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('iss')).toBe(ORIGIN);

    expect(await attempt(person, id)).toEqual({ id, state: 'approved' });
    expect(await connectionsOf(person.userId)).toEqual([
      expect.objectContaining({
        client_id: CLAUDE,
        client_name: 'Claude',
        registration: 'cimd',
        client: 'claude',
        revoked_at: null,
      }),
    ]);
    expect(await events(person.userId, 'agent_connection_completed')).toEqual([
      { name: 'agent_connection_completed', props: { client: 'claude', entry: 'home' } },
    ]);
  });

  it('Allow with an unverified email: EMAIL_NOT_VERIFIED, and no connection', async () => {
    const person = await newPerson({ verified: false });
    const { location } = await claude().authorize(person.browser);
    const res = await person.browser.send('/api/agent/approval', {
      json: { accept: true, query: location.search.slice(1) },
    });
    expect(res.status).toBe(403);
    expect(await body(res)).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
    expect(await connectionsOf(person.userId)).toEqual([]);
  });

  it('Cancel: tells the agent no, fails the attempt at authorise, and makes nothing', async () => {
    const person = await newPerson();
    const id = await startAttempt(person, {
      client: 'other',
      entry: 'onboarding',
      platform: 'any',
    });
    const { result, url } = await claude().approve(person.browser, { accept: false });
    expect(result.status).toBe(200);
    expect(`${url.origin}${url.pathname}`).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('iss')).toBe(ORIGIN);
    expect(await attempt(person, id)).toEqual({
      id,
      state: 'failed',
      failedStep: 'authorise',
      cause: 'cancelled',
    });
    expect(await connectionsOf(person.userId)).toEqual([]);
    expect(securityEmails(person)).toEqual([]);
    expect(await events(person.userId, 'agent_connection_failed')).toEqual([
      {
        name: 'agent_connection_failed',
        props: { step: 'authorise', client: 'claude', entry: 'onboarding' },
      },
    ]);
  });

  it('Cancel is open to an unverified person, who may only refuse', async () => {
    const person = await newPerson({ verified: false });
    const { location } = await claude().authorize(person.browser);
    const res = await person.browser.send('/api/agent/approval', {
      json: { accept: false, query: location.search.slice(1) },
    });
    expect(res.status).toBe(200);
    expect(new URL(String((await body(res)).url)).searchParams.get('error')).toBe('access_denied');
  });

  it('refuses a malformed decision, naming the field', async () => {
    const person = await newPerson();
    for (const json of [{ query: 'x' }, { accept: 'yes', query: 'x' }, { accept: true }, []]) {
      const res = await person.browser.send('/api/agent/approval', { json });
      expect(res.status).toBe(400);
      expect(await body(res)).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    }
    const extra = await person.browser.send('/api/agent/approval', {
      json: { accept: true, query: 'x', userId: 'usr_x' },
    });
    expect(await body(extra)).toMatchObject({ error: { fields: { userId: 'Remove it.' } } });
  });

  it('is refused from another site (the Origin check)', async () => {
    const person = await newPerson();
    const { location } = await claude().authorize(person.browser);
    const res = await person.browser.send('/api/agent/approval', {
      json: { accept: true, query: location.search.slice(1) },
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(401);
    expect(await connectionsOf(person.userId)).toEqual([]);
  });
});

describe('the connection attempt', () => {
  it('POST needs a verified email and three enums; GET of anything else is NOT_FOUND', async () => {
    const unverified = await newPerson({ verified: false });
    const refused = await unverified.browser.send('/api/agent/attempts', {
      json: { client: 'claude', entry: 'home', platform: 'phone' },
    });
    expect(refused.status).toBe(403);
    expect(await body(refused)).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });

    const person = await newPerson();
    const invalid = await person.browser.send('/api/agent/attempts', {
      json: { client: 'grok', entry: 'home', platform: 'phone' },
    });
    expect(invalid.status).toBe(400);
    expect(await body(invalid)).toMatchObject({
      error: { code: 'VALIDATION_FAILED', fields: { client: expect.any(String) as unknown } },
    });

    for (const id of ['att_01K1G4KX00AAAAAAAAAAAAAAAA', 'nope', 'con_01K1G4KX00AAAAAAAAAAAAAAAA']) {
      const res = await person.browser.send(`/api/agent/attempts/${id}`);
      expect(res.status).toBe(404);
      expect(await body(res)).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });

  it('goes started → approved → live: the token, then the first successful call', async () => {
    const person = await newPerson();
    const id = await startAttempt(person);
    const client = claude();
    const { code, verifier } = await client.connect(person.browser);
    later(MINUTE);
    expect((await client.exchange(code, verifier)).status).toBe(200);
    const [connection] = await connectionsOf(person.userId);
    const connectionId = String(connection?.id);
    later(14 * MINUTE);
    expect(await attempt(person, id)).toEqual({ id, state: 'approved' });

    expect(await target.agent.attempts.markLive(person.userId, connectionId)).toBe(true);
    expect(await target.agent.attempts.markLive(person.userId, connectionId)).toBe(false);
    expect(await attempt(person, id)).toEqual({ id, state: 'live' });
    later(60 * MINUTE);
    expect(await attempt(person, id)).toEqual({ id, state: 'live' });
    expect(await events(person.userId, 'agent_connection_failed')).toEqual([]);
  });

  it('records a connection made from the agent, with no NetNet flow open, with entry agent', async () => {
    const person = await newPerson();
    const stale = await startAttempt(person);
    later(16 * MINUTE);
    await claude().connect(person.browser);
    expect(await events(person.userId, 'agent_connection_completed')).toEqual([
      { name: 'agent_connection_completed', props: { client: 'claude', entry: 'agent' } },
    ]);
    const { rows } = await db.owner.query(
      `select entry, platform, state, client from core.connection_attempt
        where user_id = $1 and id <> $2`,
      [person.userId, stale],
    );
    expect(rows).toEqual([
      { entry: 'agent', platform: 'any', state: 'approved', client: 'claude' },
    ]);
    // The older attempt was not taken: it failed at discovery.
    expect(await attempt(person, stale)).toMatchObject({
      state: 'failed',
      failedStep: 'discovery',
    });
  });

  it('times out at discovery when no authorize request came within 15 minutes, once', async () => {
    const person = await newPerson();
    const id = await startAttempt(person, {
      client: 'chatgpt',
      entry: 'holding',
      platform: 'phone',
    });
    later(15 * MINUTE - 1000);
    expect(await attempt(person, id)).toEqual({ id, state: 'started' });
    later(1000);
    const failed = { id, state: 'failed', failedStep: 'discovery', cause: 'timed_out' };
    expect(await attempt(person, id)).toEqual(failed);
    expect(await attempt(person, id)).toEqual(failed);
    expect(await events(person.userId, 'agent_connection_failed')).toEqual([
      {
        name: 'agent_connection_failed',
        props: { step: 'discovery', client: 'chatgpt', entry: 'holding' },
      },
    ]);
  });

  it('does not time out at discovery once the agent’s authorize request has come', async () => {
    const person = await newPerson();
    const id = await startAttempt(person);
    later(10 * MINUTE);
    await claude().authorize(person.browser);
    await target.settle();
    later(10 * MINUTE);
    expect(await attempt(person, id)).toEqual({ id, state: 'started' });
  });

  it('times out at first_call when no call succeeds within 15 minutes of the token', async () => {
    const person = await newPerson();
    const id = await startAttempt(person);
    const client = claude();
    const { code, verifier } = await client.connect(person.browser);
    later(10 * MINUTE);
    await client.exchange(code, verifier);
    later(15 * MINUTE);
    expect(await attempt(person, id)).toEqual({
      id,
      state: 'failed',
      failedStep: 'first_call',
      cause: 'timed_out',
    });
    expect(await events(person.userId, 'agent_connection_failed')).toEqual([
      {
        name: 'agent_connection_failed',
        props: { step: 'first_call', client: 'claude', entry: 'home' },
      },
    ]);
  });

  it('fails at callback when the code exchange is refused, or never comes', async () => {
    const refused = await newPerson();
    const first = await startAttempt(refused);
    const client = claude();
    const { code } = await client.connect(refused.browser);
    // better-auth answers a bad verifier with the RFC 6749 invalid_grant status (400 since
    // 1.7.12; it used to be 401). The refusal, not the number, is the contract.
    expect((await client.exchange(code, 'the-wrong-verifier-the-wrong-verifier-0123')).status).toBe(
      400,
    );
    expect(await attempt(refused, first)).toEqual({
      id: first,
      state: 'failed',
      failedStep: 'callback',
      cause: 'token_rejected',
    });

    const silent = await newPerson();
    const second = await startAttempt(silent);
    await claude().connect(silent.browser);
    later(15 * MINUTE);
    expect(await attempt(silent, second)).toEqual({
      id: second,
      state: 'failed',
      failedStep: 'callback',
      cause: 'timed_out',
    });
  });

  it('fails at authorise when the agent’s request is refused', async () => {
    const person = await newPerson();
    const id = await startAttempt(person);
    await claude().authorize(person.browser, { scope: 'everything' });
    await target.settle();
    expect(await attempt(person, id)).toEqual({
      id,
      state: 'failed',
      failedStep: 'authorise',
      cause: 'invalid_request',
    });
  });

  it('is swept daily: discovery and first_call timeouts fail, with their events, nothing else', async () => {
    // One person each: an attempt nobody connected to, one connected with no call, one live.
    const silent = await newPerson();
    const undiscovered = await startAttempt(silent, {
      client: 'other',
      entry: 'onboarding',
      platform: 'any',
    });
    const quiet = await newPerson();
    const uncalled = await startAttempt(quiet);
    const busy = await newPerson();
    const called = await startAttempt(busy);
    for (const person of [quiet, busy]) {
      const client = claude();
      const { code, verifier } = await client.connect(person.browser);
      await client.exchange(code, verifier);
    }
    const [connection] = await connectionsOf(busy.userId);
    await target.agent.attempts.markLive(busy.userId, String(connection?.id));

    later(15 * MINUTE - 1000);
    const fresh = await startAttempt(silent);
    expect((await target.app.request(`${ORIGIN}/api/cron/daily`)).status).toBe(401);
    // (The sweep is every user's: other tests' attempts may fail in it too.)
    await daily();
    expect(await events(silent.userId, 'agent_connection_failed')).toEqual([]);
    expect(await events(quiet.userId, 'agent_connection_failed')).toEqual([]);

    later(1000);
    const res = await daily();
    expect(res.status).toBe(200);
    expect((await body(res)).attemptsFailed).toBeGreaterThanOrEqual(2);
    const states = async (userId: string) =>
      (
        await db.owner.query<Record<string, unknown>>(
          `select id, state, failed_step, cause from core.connection_attempt
            where user_id = $1 order by started_at, id`,
          [userId],
        )
      ).rows;
    expect(await states(silent.userId)).toEqual([
      { id: undiscovered, state: 'failed', failed_step: 'discovery', cause: 'timed_out' },
      { id: fresh, state: 'started', failed_step: null, cause: null },
    ]);
    expect(await states(quiet.userId)).toEqual([
      { id: uncalled, state: 'failed', failed_step: 'first_call', cause: 'timed_out' },
    ]);
    expect(await states(busy.userId)).toEqual([
      { id: called, state: 'live', failed_step: null, cause: null },
    ]);
    expect(await events(silent.userId, 'agent_connection_failed')).toEqual([
      {
        name: 'agent_connection_failed',
        props: { step: 'discovery', client: 'other', entry: 'onboarding' },
      },
    ]);
    expect(await events(quiet.userId, 'agent_connection_failed')).toEqual([
      {
        name: 'agent_connection_failed',
        props: { step: 'first_call', client: 'claude', entry: 'home' },
      },
    ]);
    expect(await events(busy.userId, 'agent_connection_failed')).toEqual([]);

    // A second run fails nothing twice.
    await daily();
    expect(await events(silent.userId, 'agent_connection_failed')).toHaveLength(1);
    expect(await events(quiet.userId, 'agent_connection_failed')).toHaveLength(1);
  });
});

describe('classification', () => {
  it.each([
    ['Claude by CIMD', () => AgentClient.cimd(target, CLAUDE, 'Claude'), 'claude', 'cimd'],
    [
      'OpenAI’s Codex by CIMD (the unlisted ChatGPT guide)',
      () => AgentClient.cimd(target, CODEX, 'Codex', 'http://127.0.0.1:1455/auth/callback'),
      'chatgpt',
      'cimd',
    ],
    [
      'a DCR client returning to claude.ai',
      () =>
        AgentClient.register(
          target,
          'Claude',
          'https://claude.ai/api/mcp/auth_callback',
          '203.0.113.20',
        ),
      'claude',
      'dcr',
    ],
    [
      'a DCR client anywhere else, calling itself Claude',
      () => AgentClient.register(target, 'Claude', 'https://agent.example/cb', '203.0.113.21'),
      'other',
      'dcr',
    ],
  ] as const)('%s is %s, and events carry only that', async (_case, make, client, registration) => {
    const person = await newPerson();
    const agent = await make();
    const { code, verifier } = await agent.connect(person.browser);
    await agent.exchange(code, verifier);
    expect(await connectionsOf(person.userId)).toEqual([
      expect.objectContaining({ client, registration }),
    ]);
    const all = await events(person.userId);
    expect(all.map((e) => e.name)).toEqual(
      expect.arrayContaining(['agent_connection_completed', 'security_email_sent']),
    );
    for (const e of all.filter((e) => e.name !== 'account_created')) {
      expect(e.props.client).toBe(client);
      expect(JSON.stringify(e.props)).not.toMatch(/Claude|Codex/);
    }
  });
});

describe('the security email', () => {
  it('goes once per Allow, by email, and fires security_email_sent when accepted', async () => {
    const person = await newPerson({ timeZone: 'Asia/Singapore' });
    await claude().connect(person.browser);
    await target.settle();
    const sent = securityEmails(person);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.rendered.subject).toBe('Claude was connected to your NetNet');
    expect(sent[0]?.rendered.text).toContain('On 1 Aug 2026 at 6:00 pm, you allowed Claude');
    expect(sent[0]?.rendered.text).toContain('requests come from claude.ai');
    expect(sent[0]?.rendered.text).not.toContain(UNVERIFIED_NAME);
    expect(sent[0]?.rendered.text).toContain(`Revoke it: ${ORIGIN}/app/agent`);
    const [connection] = await connectionsOf(person.userId);
    expect(connection?.security_email_sent_at).toEqual(FIXED_NOW);
    expect(await events(person.userId, 'security_email_sent')).toEqual([
      { name: 'security_email_sent', props: { client: 'claude' } },
    ]);

    // A second Allow is a second connection and a second email; the retry sends neither again.
    await claude().connect(person.browser);
    later(11 * MINUTE);
    await reminders();
    expect(securityEmails(person)).toHaveLength(2);
    expect(await events(person.userId, 'security_email_sent')).toHaveLength(2);
  });

  it('escapes a DCR client’s name, cuts it to 40 characters, and says NetNet cannot verify it', async () => {
    const person = await newPerson();
    const agent = await AgentClient.register(
      target,
      '<img src=x onerror=alert(1)> Fictional agent with a long name',
      'https://agent.example/cb',
      '203.0.113.30',
    );
    await agent.connect(person.browser);
    await target.settle();
    const [email] = securityEmails(person);
    expect(email?.rendered.subject).toBe(
      '<img src=x onerror=alert(1)> Fictional… (the name it gave; NetNet can’t verify it) was connected to your NetNet',
    );
    expect(email?.rendered.html).not.toContain('<img');
    expect(email?.rendered.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('carries the caveat and the host for a CIMD document at a host no guide names (M-2)', async () => {
    const person = await newPerson();
    const attacker = AgentClient.cimd(
      target,
      'https://attacker.example/client.json',
      'Claude',
      'https://attacker.example/callback',
    );
    await attacker.connect(person.browser);
    await target.settle();
    const [email] = securityEmails(person);
    expect(email?.rendered.subject).toBe(`Claude ${UNVERIFIED_NAME} was connected to your NetNet`);
    expect(email?.rendered.text).toContain('requests come from attacker.example');
    expect(email?.rendered.html).toContain('attacker.example');

    const list = (await (await person.browser.send('/api/agent/connections')).json()) as Record<
      string,
      unknown
    >[];
    expect(list).toMatchObject([
      { clientName: 'Claude', registration: 'cimd', client: 'other', nameVerified: false },
    ]);
  });

  it('is retried by the reminder run when Resend did not accept it, from 10 minutes to 7 days', async () => {
    const person = await newPerson();
    target.emailDown.value = true;
    await claude().connect(person.browser);
    await target.settle();
    const [connection] = await connectionsOf(person.userId);
    expect(connection?.security_email_sent_at).toBeNull();
    expect(await events(person.userId, 'security_email_sent')).toEqual([]);

    // Not yet: younger than 10 minutes.
    later(9 * MINUTE);
    expect(await body(await reminders())).toMatchObject({ securityEmails: { sent: 0, failed: 0 } });

    // Resend still down: the run says it failed, and the email stays unsent.
    later(2 * MINUTE);
    const down = await reminders();
    expect(down.status).toBe(502);
    expect(await body(down)).toMatchObject({ securityEmails: { sent: 0, failed: 1 } });
    expect(securityEmails(person)).toEqual([]);

    target.emailDown.value = false;
    later(24 * 60 * MINUTE);
    const res = await reminders();
    expect(res.status).toBe(200);
    expect((await body(res)).securityEmails).toMatchObject({ sent: 1 });
    expect(securityEmails(person)).toHaveLength(1);
    expect(await events(person.userId, 'security_email_sent')).toHaveLength(1);
    await reminders();
    expect(securityEmails(person)).toHaveLength(1);
  });

  it('is not retried after 7 days', async () => {
    const person = await newPerson();
    target.emailDown.value = true;
    await claude().connect(person.browser);
    await target.settle();
    target.emailDown.value = false;
    later(7 * 24 * 60 * MINUTE + MINUTE);
    await reminders();
    expect(securityEmails(person)).toEqual([]);
  });
});

describe('the Agent tab', () => {
  it('lists active connections, newest first, with the name cleaned and whether it is verified', async () => {
    const person = await newPerson();
    await claude().connect(person.browser);
    later(MINUTE);
    const dcr = await AgentClient.register(
      target,
      'Fictional\nagent',
      'https://agent.example/cb',
      '203.0.113.40',
    );
    await dcr.connect(person.browser);
    const res = await person.browser.send('/api/agent/connections');
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    for (const item of list) expect(agentConnectionSchema.safeParse(item).success).toBe(true);
    expect(list).toEqual([
      {
        id: expect.stringMatching(/^con_/) as unknown,
        clientName: 'Fictional agent',
        client: 'other',
        registration: 'dcr',
        nameVerified: false,
        createdAt: new Date(FIXED_NOW.getTime() + MINUTE).toISOString(),
        lastUsedAt: null,
      },
      {
        id: expect.stringMatching(/^con_/) as unknown,
        clientName: 'Claude',
        client: 'claude',
        registration: 'cimd',
        nameVerified: true,
        createdAt: FIXED_NOW.toISOString(),
        lastUsedAt: null,
      },
    ]);
  });

  it('records calls: first_call_at once, last_used_at at most once a minute', async () => {
    const person = await newPerson();
    await claude().connect(person.browser);
    const [connection] = await connectionsOf(person.userId);
    const id = String(connection?.id);
    await target.agent.connections.touch(id);
    later(30_000);
    await target.agent.connections.touch(id);
    expect(await connectionsOf(person.userId)).toEqual([
      expect.objectContaining({ first_call_at: FIXED_NOW, last_used_at: FIXED_NOW }),
    ]);
    later(31_000);
    await target.agent.connections.touch(id);
    expect(await connectionsOf(person.userId)).toEqual([
      expect.objectContaining({ first_call_at: FIXED_NOW, last_used_at: target.clock.now }),
    ]);
  });

  it('revokes: the refresh token stops working, the next call is refused, and Activity has it', async () => {
    const person = await newPerson();
    await seedLedger(db.withUser, {
      userId: person.userId,
      baseCurrency: 'SGD',
      connectionId: CONNECTION_A,
    });
    const client = claude();
    const { code, verifier } = await client.connect(person.browser);
    const tokens = await client.exchange(code, verifier);
    const verify = createVerifyAccessToken(() => ({
      origin: ORIGIN,
      jwks: jwksFrom(() => target.auth, ORIGIN),
      clock: () => new Date(),
    }));
    const access = await verify(
      new Request(MCP_URL, {
        headers: { Authorization: `Bearer ${String(tokens.body.access_token)}` },
      }),
    );
    const call = () =>
      db.withUser(access.userId, { kind: 'agent', connectionId: access.connectionId }, () =>
        Promise.resolve('called'),
      );
    expect(await call()).toBe('called');
    const { rows: before } = await db.owner.query<{ data_version: number }>(
      'select data_version from ledger.ledger_state where user_id = $1',
      [person.userId],
    );

    later(MINUTE);
    const res = await person.browser.send(`/api/agent/connections/${access.connectionId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({
      result: null,
      dataVersion: (before[0]?.data_version ?? 0) + 1,
      warnings: [],
    });

    // The access token is still a valid JWT for an hour; the call is refused all the same.
    expect(
      (
        await verify(
          new Request(MCP_URL, {
            headers: { Authorization: `Bearer ${String(tokens.body.access_token)}` },
          }),
        )
      ).connectionId,
    ).toBe(access.connectionId);
    await expect(call()).rejects.toBeInstanceOf(ConnectionRevoked);
    expect((await client.refresh(String(tokens.body.refresh_token))).body).toMatchObject({
      error: 'invalid_grant',
    });
    expect(await connectionsOf(person.userId)).toEqual([
      expect.objectContaining({ revoked_at: target.clock.now }),
    ]);
    expect(await body(await person.browser.send('/api/agent/connections'))).toEqual([]);

    const { rows: audit } = await db.owner.query(
      `select actor, action, entity, entity_id, connection_id, before->>'revokedAt' as before,
              after->>'revokedAt' as after
         from ledger.audit where user_id = $1 and action = 'connection.revoke'`,
      [person.userId],
    );
    expect(audit).toEqual([
      {
        actor: 'user',
        action: 'connection.revoke',
        entity: 'connection',
        entity_id: access.connectionId,
        connection_id: null,
        before: null,
        after: target.clock.now.toISOString(),
      },
    ]);

    // Revoked once: a second time is NOT_FOUND.
    expect(
      (
        await person.browser.send(`/api/agent/connections/${access.connectionId}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
  });

  it('revokes for someone with no ledger yet, with nothing to audit against', async () => {
    const person = await newPerson();
    await claude().connect(person.browser);
    const [connection] = await connectionsOf(person.userId);
    const res = await person.browser.send(`/api/agent/connections/${String(connection?.id)}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ result: null, dataVersion: null, warnings: [] });
  });

  it('answers NOT_FOUND for an id that is not a connection, and needs a session', async () => {
    const person = await newPerson();
    for (const id of ['con_01K1G4KX00ZZZZZZZZZZZZZZZZ', 'nope']) {
      const res = await person.browser.send(`/api/agent/connections/${id}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    }
    const { Browser } = await import('../support/accounts-app');
    expect((await new Browser(target).send('/api/agent/connections')).status).toBe(401);
  });
});
