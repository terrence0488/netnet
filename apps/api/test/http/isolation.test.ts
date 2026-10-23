import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import {
  MARKER_A,
  MARKER_B,
  USER_A,
  USER_B,
  createTestDatabase,
  seedUsers,
  type Fixtures,
  type TestDatabase,
} from '../isolation/harness';
import { ledgerApp, person, type LedgerApp, type Person } from './support';

/**
 * The REST isolation suite (architecture §8, CONVENTIONS §9): every route over the Ledger, called
 * by user B with user A's ids, answers NOT_FOUND (never "forbidden"), carries none of A's names
 * and none of A's ids beyond those B sent, and leaves A's ledger exactly as it was; a refused call
 * leaves B's as it was too. The registry test fails when any route of the app has no isolation
 * case, here or in the file named for it, and is not listed as holding no user data.
 */

/** The routes this suite covers. */
const ROUTES = [
  'GET /api/snapshot',
  'POST /api/holdings',
  'PATCH /api/holdings/:id',
  'DELETE /api/holdings/:id',
  'GET /api/holdings/:id/values',
  'POST /api/holdings/:id/values',
  'PATCH /api/values/:id',
  'DELETE /api/values/:id',
  'POST /api/types',
  'PATCH /api/types/:id',
  'DELETE /api/types/:id',
  'POST /api/tags',
  'PATCH /api/tags/:id',
  'DELETE /api/tags/:id',
  'PATCH /api/prefs',
  'GET /api/activity',
] as const;
type Route = (typeof ROUTES)[number];

/** Routes with user data whose isolation case lives in another file (relative to apps/api). */
const COVERED_ELSEWHERE: Record<string, string> = {
  'GET /api/me': 'test/isolation/me.test.ts',
  'PATCH /api/me': 'test/isolation/me.test.ts',
  'GET /api/export': 'test/http/export.test.ts',
  'DELETE /api/account': 'test/http/account.test.ts',
  'POST /api/agent/attempts': 'test/isolation/agent.test.ts',
  'GET /api/agent/attempts/:id': 'test/isolation/agent.test.ts',
  'GET /api/agent/connections': 'test/isolation/agent.test.ts',
  'DELETE /api/agent/connections/:id': 'test/isolation/agent.test.ts',
  'GET /api/agent/approval': 'test/isolation/agent.test.ts',
  'POST /api/agent/approval': 'test/isolation/agent.test.ts',
  'POST /api/reminders/opened': 'test/reminders/routes.test.ts',
  'POST /api/reminders/unsubscribe': 'test/reminders/routes.test.ts',
  'GET /api/notifications/prefs': 'test/notifications/isolation.test.ts',
  'PATCH /api/notifications/prefs': 'test/notifications/isolation.test.ts',
  'POST /api/notifications/endpoints': 'test/notifications/isolation.test.ts',
  'PUT /api/notifications/endpoints/:id': 'test/notifications/isolation.test.ts',
  'DELETE /api/notifications/endpoints/:id': 'test/notifications/isolation.test.ts',
  'POST /mcp': 'test/mcp/isolation.test.ts',
};

/** Routes that reach no one's ledger and take no ids of anyone's, so B has nothing of A's to name. */
const NO_USER_DATA: Record<string, string> = {
  'GET /api/health': 'never touches the database',
  'POST /api/auth/sign-up/email': 'Better Auth: makes an account from an email and a password',
  'POST /api/auth/sign-in/email': 'Better Auth: signs in with an email and a password',
  'POST /api/auth/sign-in/social': 'Better Auth: starts a provider flow; takes no ids',
  'GET /api/auth/callback/:id': 'Better Auth: only a state this server minted completes it',
  'POST /api/auth/callback/:id': 'Better Auth: Apple’s form POST of the same answer',
  'POST /api/auth/request-password-reset': 'Better Auth: never says whether an account exists',
  'POST /api/auth/send-verification-email': 'Better Auth: sends only to a real account',
  'GET /api/auth/verify-email': 'Better Auth: the signed token is the only input',
  'GET /api/auth/reset-password/:token': 'Better Auth: the token is the only input',
  'POST /api/auth/reset-password': 'Better Auth: the token is the only input',
  'POST /api/auth/sign-out': 'Better Auth: ends the session it is sent with',
  'GET /api/auth/get-session': 'Better Auth: the session it is sent with',
  'GET /api/geo': 'the CDN’s country for the request',
  'POST /api/events': 'writes the session’s own client event; takes no ids',
  'GET /api/notifications/vapid-key': 'the public VAPID key, the same for everyone',
  'GET /api/content/current': 'published content, the same for everyone',
  'GET /api/content/:kind/:ref': 'published content, the same for everyone',
  'GET /api/cron/fx': 'the cron secret, and exchange rates only',
  'GET /api/cron/daily': 'the cron secret; answers counts only',
  'GET /api/cron/reminders': 'the cron secret; answers counts only',
  'GET /.well-known/oauth-authorization-server': 'OAuth metadata, the same for everyone',
  'GET /.well-known/oauth-protected-resource': 'OAuth metadata, the same for everyone',
  'GET /.well-known/oauth-protected-resource/mcp': 'OAuth metadata, the same for everyone',
  'GET /api/auth/jwks': 'the public signing keys, the same for everyone',
  'GET /api/auth/oauth2/authorize':
    'Better Auth: sends the session’s own person to the approval page',
  'POST /api/auth/oauth2/register': 'Better Auth: registers a client; takes no cookie and no ids',
  'POST /api/auth/oauth2/token':
    'Better Auth: answers only the holder of the code or token; no cookie',
  'POST /api/auth/oauth2/revoke': 'Better Auth: answers only the holder of the token; no cookie',
  'GET /mcp': 'stateless MCP: the SDK answers 405 without touching the ledger',
  'DELETE /mcp': 'stateless MCP: the SDK answers 405 without touching the ledger',
};

/** Every route the app serves, as `METHOD /path`, middleware aside. */
function appRoutes(): string[] {
  const routes = app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`);
  return [...new Set(routes)].sort();
}

let db: TestDatabase;
let target: LedgerApp;
let fixtures: Fixtures;
let b: Person;
let aIds: string[];

beforeAll(async () => {
  db = await createTestDatabase();
  target = ledgerApp(db);
  fixtures = await seedUsers(db);
  b = person(target, USER_B);
  const { a } = fixtures;
  aIds = [USER_A, ...a.typeIds, a.tagId, ...a.holdingIds, ...a.valueIds, a.batchId, ...a.auditIds];
}, 60_000);

afterAll(async () => {
  target?.restore();
  await db?.close();
});

const LEDGER_TABLES = [
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

/** All of a user's ledger rows, as the owner sees them. */
async function ledgerOf(userId: string): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const table of LEDGER_TABLES) {
    const { rows } = await db.owner.query(
      `select * from ledger.${table} where user_id = $1 order by 1, 2`,
      [userId],
    );
    out[table] = rows;
  }
  return JSON.stringify(out);
}

interface Case {
  name: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: () => string;
  json?: () => unknown;
  /** A's ids the call sends, which may come back in the answer (an error naming them). */
  sent: () => string[];
  status: number;
  /** A 200 GET whose answer is empty by design (a filter that matches nothing of B's). */
  empty?: true;
}

const a = () => fixtures.a;
const own = () => fixtures.b;
const [aCash, aListed] = [() => a().typeIds[0] ?? '', () => a().typeIds[1] ?? ''];
const aHolding = () => a().holdingIds[0] ?? '';
const aValue = () => a().valueIds[0] ?? '';
const bCash = () => own().typeIds[0] ?? '';
const bHolding = () => own().holdingIds[0] ?? '';

const CASES: Record<Route, Case[]> = {
  'GET /api/snapshot': [
    {
      name: 'B reads B’s own snapshot, whatever names A in the query',
      method: 'GET',
      path: () => `/api/snapshot?userId=${USER_A}&user_id=${USER_A}`,
      sent: () => [],
      status: 200,
    },
  ],
  'POST /api/holdings': [
    {
      name: 'with A’s type',
      method: 'POST',
      path: () => '/api/holdings',
      json: () => ({ name: 'Pot', kind: 'asset', typeId: aCash(), currency: 'EUR', via: 'form' }),
      sent: () => [aCash()],
      status: 404,
    },
    {
      name: 'with A’s tag',
      method: 'POST',
      path: () => '/api/holdings',
      json: () => ({
        name: 'Pot',
        kind: 'asset',
        typeId: bCash(),
        currency: 'EUR',
        tagIds: [a().tagId],
        via: 'form',
      }),
      sent: () => [a().tagId],
      status: 404,
    },
  ],
  'PATCH /api/holdings/:id': [
    {
      name: 'A’s holding',
      method: 'PATCH',
      path: () => `/api/holdings/${aHolding()}`,
      json: () => ({ name: 'Mine now' }),
      sent: () => [aHolding()],
      status: 404,
    },
    {
      name: 'B’s holding moved to A’s type',
      method: 'PATCH',
      path: () => `/api/holdings/${bHolding()}`,
      json: () => ({ typeId: aListed() }),
      sent: () => [aListed()],
      status: 404,
    },
    {
      name: 'B’s holding tagged with A’s tag',
      method: 'PATCH',
      path: () => `/api/holdings/${bHolding()}`,
      json: () => ({ tagIds: [a().tagId] }),
      sent: () => [a().tagId],
      status: 404,
    },
  ],
  'DELETE /api/holdings/:id': [
    {
      name: 'A’s holding',
      method: 'DELETE',
      path: () => `/api/holdings/${aHolding()}`,
      sent: () => [aHolding()],
      status: 404,
    },
  ],
  'GET /api/holdings/:id/values': [
    {
      name: 'A’s holding’s values',
      method: 'GET',
      path: () => `/api/holdings/${aHolding()}/values?limit=200`,
      sent: () => [aHolding()],
      status: 404,
    },
  ],
  'POST /api/holdings/:id/values': [
    {
      name: 'a value for A’s holding',
      method: 'POST',
      path: () => `/api/holdings/${aHolding()}/values`,
      json: () => ({ amount: '1', date: '2026-07-31' }),
      sent: () => [aHolding()],
      status: 404,
    },
  ],
  'PATCH /api/values/:id': [
    {
      name: 'A’s value',
      method: 'PATCH',
      path: () => `/api/values/${aValue()}`,
      json: () => ({ amount: '1' }),
      sent: () => [aValue()],
      status: 404,
    },
  ],
  'DELETE /api/values/:id': [
    {
      name: 'A’s value',
      method: 'DELETE',
      path: () => `/api/values/${aValue()}`,
      sent: () => [aValue()],
      status: 404,
    },
  ],
  'POST /api/types': [
    {
      name: 'naming A’s type: POST takes no id, so it is refused before any lookup',
      method: 'POST',
      path: () => '/api/types',
      json: () => ({ id: aCash(), name: 'Mine now', universal: 'cash' }),
      sent: () => [aCash()],
      status: 400,
    },
  ],
  'PATCH /api/types/:id': [
    {
      name: 'A’s type',
      method: 'PATCH',
      path: () => `/api/types/${aCash()}`,
      json: () => ({ name: 'Mine now' }),
      sent: () => [aCash()],
      status: 404,
    },
  ],
  'DELETE /api/types/:id': [
    {
      name: 'A’s type',
      method: 'DELETE',
      path: () => `/api/types/${aCash()}`,
      sent: () => [aCash()],
      status: 404,
    },
    {
      name: 'B’s type merged into A’s',
      method: 'DELETE',
      path: () => `/api/types/${bCash()}?moveTo=${aCash()}`,
      sent: () => [aCash()],
      status: 404,
    },
  ],
  'POST /api/tags': [
    {
      name: 'naming A’s tag: POST takes no id, so it is refused before any lookup',
      method: 'POST',
      path: () => '/api/tags',
      json: () => ({ id: a().tagId, name: 'Mine now' }),
      sent: () => [a().tagId],
      status: 400,
    },
  ],
  'PATCH /api/tags/:id': [
    {
      name: 'A’s tag',
      method: 'PATCH',
      path: () => `/api/tags/${a().tagId}`,
      json: () => ({ name: 'Mine now' }),
      sent: () => [a().tagId],
      status: 404,
    },
  ],
  'DELETE /api/tags/:id': [
    {
      name: 'A’s tag',
      method: 'DELETE',
      path: () => `/api/tags/${a().tagId}`,
      sent: () => [a().tagId],
      status: 404,
    },
    {
      name: 'B’s tag merged into A’s',
      method: 'DELETE',
      path: () => `/api/tags/${own().tagId}?mergeInto=${a().tagId}`,
      sent: () => [a().tagId],
      status: 404,
    },
  ],
  'GET /api/activity': [
    {
      name: 'B reads B’s own log, whatever names A in the query',
      method: 'GET',
      path: () => `/api/activity?userId=${USER_A}`,
      sent: () => [],
      status: 200,
    },
    {
      name: 'A’s batch filters to an empty page, not A’s turn',
      method: 'GET',
      path: () => `/api/activity?batchId=${a().batchId}`,
      sent: () => [a().batchId],
      status: 200,
      empty: true,
    },
  ],
  'PATCH /api/prefs': [
    {
      name: 'a filter naming A’s type',
      method: 'PATCH',
      path: () => '/api/prefs',
      json: () => ({ homeFilter: { typeIds: [aCash()] } }),
      sent: () => [aCash()],
      status: 404,
    },
    {
      name: 'a filter naming A’s tag',
      method: 'PATCH',
      path: () => '/api/prefs',
      json: () => ({ homeFilter: { hideTagIds: [a().tagId] } }),
      sent: () => [a().tagId],
      status: 404,
    },
    {
      name: 'an exclusion naming A’s holding',
      method: 'PATCH',
      path: () => '/api/prefs',
      json: () => ({ insightsFilter: { hideHoldingIds: [aHolding()] } }),
      sent: () => [aHolding()],
      status: 404,
    },
  ],
};

describe('the registry', () => {
  it('has an isolation case, or a reason it needs none, for every route of the app', () => {
    const covered = new Set<string>([
      ...ROUTES,
      ...Object.keys(COVERED_ELSEWHERE),
      ...Object.keys(NO_USER_DATA),
    ]);
    const routes = appRoutes();
    expect(routes.filter((route) => !covered.has(route))).toStrictEqual([]);
    expect([...covered].filter((route) => !routes.includes(route))).toStrictEqual([]);
    for (const route of ROUTES) expect(CASES[route].length, route).toBeGreaterThan(0);
  });

  it('points at files that exist and exercise the route', () => {
    const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
    for (const [route, file] of Object.entries(COVERED_ELSEWHERE)) {
      const path = `${apiRoot}${file}`;
      expect(existsSync(path), file).toBe(true);
      // The path up to its first parameter: a test names `/api/agent/attempts/${id}`, say.
      expect(readFileSync(path, 'utf8'), file).toContain(route.split(' ')[1]!.split(':')[0]);
    }
  });

  it('finds each route mounted in app.ts, needing a session, never cached', async () => {
    for (const route of ROUTES) {
      const [method = '', pattern = ''] = route.split(' ');
      const path = pattern.replace(':id', 'hld_01K1G4KX00ZZZZZZZZZZZZZZZZ');
      const res = await app.request(path, {
        method,
        ...(method === 'GET' || method === 'DELETE'
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      });
      expect(res.status, route).toBe(401);
      expect(res.headers.get('Cache-Control'), route).toBe('private, no-store');
      expect(await res.json(), route).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    }
  });
});

describe('REST routes as user B, with user A’s ids', () => {
  for (const route of ROUTES) {
    for (const c of CASES[route]) {
      it(`${route}: ${c.name}`, async () => {
        const beforeA = await ledgerOf(USER_A);
        const beforeB = await ledgerOf(USER_B);
        const body = c.json?.();
        const res =
          c.method === 'GET'
            ? await b.get(c.path())
            : c.method === 'DELETE'
              ? await b.delete(c.path())
              : c.method === 'POST'
                ? await b.post(c.path(), body)
                : await b.patch(c.path(), body);
        const text = await res.text();
        expect(res.status, text).toBe(c.status);
        if (c.status === 404) {
          expect(JSON.parse(text)).toMatchObject({ error: { code: 'NOT_FOUND' } });
        }
        expect(text).not.toContain(MARKER_A);
        const sent = c.sent();
        for (const id of aIds) if (!sent.includes(id)) expect(text).not.toContain(id);
        if (c.status === 200 && c.method === 'GET' && !c.empty) {
          expect(text).toContain(MARKER_B);
        }
        if (c.empty) expect(JSON.parse(text)).toEqual({ items: [], nextCursor: null });

        await target.settle();
        expect(await ledgerOf(USER_A)).toBe(beforeA);
        if (c.status >= 400) expect(await ledgerOf(USER_B)).toBe(beforeB);
      });
    }
  }
});
