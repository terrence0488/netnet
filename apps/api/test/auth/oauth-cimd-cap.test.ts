import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEW_CIMD_CLIENTS_PER_HOUR } from '../../src/auth/oauth-routes';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';
import { metadataDocument } from '../support/cimd-server';
import { AgentClient } from '../support/oauth-client';

/**
 * P4-T17's cap on new CIMD clients: the authorize path may add `NEW_CIMD_CLIENTS_PER_HOUR`
 * `core.oauth_client` rows an hour and no more, and a client already stored is still resolved.
 * A database of its own, so the rows earlier tests created never reach the cap by accident.
 */
let db: TestDatabase;
let target: AccountsApp;

const KNOWN = 'https://agent.example/cimd/known.json';
const LATE = 'https://agent.example/cimd/late.json';
const REDIRECT = 'https://agent.example/cb';

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function cimdRows(): Promise<number> {
  const { rows } = await db.owner.query<{ n: number }>(
    `select count(*)::int as n from core.oauth_client where client_discovery_id = 'cimd'`,
  );
  return rows[0]?.n ?? 0;
}

/** One authorize request from a script: no cookie, a fresh PKCE pair, the agent's own address. */
async function authorize(clientId: string, ip: string) {
  const { url } = new AgentClient(target, clientId, REDIRECT).authorizeUrl();
  const res = await target.app.request(url, { headers: { 'x-real-ip': ip } });
  return { status: res.status, location: new URL(res.headers.get('Location') ?? '/', ORIGIN) };
}

describe('the cap on new CIMD clients', () => {
  it('refuses the 61st new client an hour with temporarily_unavailable, and a known client still resolves', async () => {
    target.cimd.serve(KNOWN, metadataDocument(KNOWN, 'Known agent', [REDIRECT]));
    target.cimd.serve(LATE, metadataDocument(LATE, 'Late agent', [REDIRECT]));

    // The first client is resolved, stored, and sent on to the approval page.
    const first = await authorize(KNOWN, '198.51.100.70');
    expect(first.status).toBe(302);
    expect(first.location.pathname).toBe('/app/connect/approve');
    expect(first.location.searchParams.get('sig')).toBeTruthy();
    expect(await cimdRows()).toBe(1);

    // Fill the hour's cap with rows the library would have written: 59 more, 60 in all.
    await db.owner.query(
      `insert into core.oauth_client
         (id, client_id, client_discovery_id, created_at, updated_at, redirect_uris,
          token_endpoint_auth_method)
       select 'probe_' || g, 'https://agent.example/cimd/known-' || g || '.json', 'cimd',
              now(), now(), array[$1]::text[], 'none'
         from generate_series(1, $2::int) as g`,
      [REDIRECT, NEW_CIMD_CLIENTS_PER_HOUR - 1],
    );
    expect(await cimdRows()).toBe(NEW_CIMD_CLIENTS_PER_HOUR);

    // The 61st document is refused before it is fetched or stored.
    const refused = await authorize(LATE, '198.51.100.71');
    expect(refused.status).toBe(302);
    expect(refused.location.pathname).toBe('/app/connect/approve');
    expect(refused.location.searchParams.get('error')).toBe('temporarily_unavailable');
    expect(target.cimd.fetched).not.toContain(LATE);
    expect(await cimdRows()).toBe(NEW_CIMD_CLIENTS_PER_HOUR);

    // A client already stored is not a new one: it resolves, and is not refused.
    const again = await authorize(KNOWN, '198.51.100.72');
    expect(again.status).toBe(302);
    expect(again.location.pathname).toBe('/app/connect/approve');
    expect(again.location.searchParams.get('sig')).toBeTruthy();
    expect(again.location.searchParams.get('error')).toBeNull();
  }, 60_000);
});
