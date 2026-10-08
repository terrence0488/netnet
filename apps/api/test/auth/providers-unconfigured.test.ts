import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../isolation/harness';
import { Browser, ORIGIN, accountsApp, type AccountsApp } from '../support/accounts-app';

/**
 * Sign-in without the provider secrets (P2-T1, F17/F18 pending): no provider is configured, so
 * starting a provider flow answers "not set up", the callback has no flow to complete, and the
 * email flow is untouched. Its own file, because the harness builds one database per test file
 * and each app seeds the OAuth server's rows on first use; a second app on the same database
 * would also reset the `netnet_app` password out from under the first.
 */
let db: TestDatabase;
let target: AccountsApp;

beforeAll(async () => {
  db = await createTestDatabase();
  target = accountsApp(db);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('without the secrets (F17/F18 pending)', () => {
  it('leaves the providers cleanly unavailable and the email flow untouched', async () => {
    const start = await new Browser(target).send('/api/auth/sign-in/social', {
      json: { provider: 'google', callbackURL: `${ORIGIN}/app` },
    });
    expect(start.status).toBe(404);

    const callback = await new Browser(target).send(
      '/api/auth/callback/google?code=fake-code&state=fake-state',
    );
    expect(callback.status).toBe(302);
    // Better Auth's own error page, which NetNet does not serve: the web app always sends an
    // errorCallbackURL, so a real failure returns to the screen it started from.
    expect(callback.headers.get('Location')).toContain(`${ORIGIN}/api/auth/error`);

    const browser = new Browser(target);
    expect((await browser.signUp('unconfigured@example.com', 'correct horse')).status).toBe(200);
    await target.settle();
    expect((await browser.send('/api/me')).status).toBe(200);
  });
});
