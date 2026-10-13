import { withClient } from '@netnet/api/db/client';
import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  signedUp,
} from './accounts';

/**
 * The reminder's links (PRD J12): the footer's unsubscribe page, and the `?r=` token an open
 * carries. The API halves are apps/api/test/reminders/routes.test.ts; these are the pages.
 */
test.describe('the reminder links', () => {
  onlyAgainstTheLocalApp();

  test('an unknown unsubscribe link says so', async ({ page }, testInfo) => {
    await page.goto('/app/reminders/unsubscribe?token=r1.forged.forged');
    await expect(page.getByRole('heading', { name: 'That link didn’t work' })).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });

  test('a signed unsubscribe link turns email reminders off', async ({ page }, testInfo) => {
    test.skip(
      !process.env.LINK_SIGNING_SECRET,
      'needs the link secret the server signs with (LINK_SIGNING_SECRET)',
    );
    const person = newPerson(testInfo);
    await arriveAs(page, person);
    await signedUp(page, person);
    const userId = await queryOne(
      'select id from core.user where email = $1',
      [person.email],
      'id',
    );
    const sentAt = new Date(Date.now() - 60_000).toISOString();
    const token = mintToken(process.env.LINK_SIGNING_SECRET ?? '', userId, sentAt);
    await page.goto(`/app/reminders/unsubscribe?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole('heading', { name: 'Email reminders are off' })).toBeVisible();
    expect(
      await queryOne(
        'select email_enabled from core.reminder_state where user_id = $1',
        [userId],
        'email_enabled',
      ),
    ).toBe(false);
  });

  test('?r= is dropped from the address once the app opens', async ({ page }) => {
    await page.goto('/app/login?r=r1.open.open');
    await expect(page).not.toHaveURL(/[?&]r=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
  });
});

/** One cell from the local database the built app runs on. */
async function queryOne(sql: string, values: unknown[], column: string): Promise<string> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('This spec reads the local database: set DATABASE_URL.');
  return withClient(url, async (client) => {
    const { rows } = await client.query(sql, values);
    const value = (rows[0] as Record<string, unknown> | undefined)?.[column];
    if (value === undefined) throw new Error(`No row for ${sql}`);
    return value as string;
  });
}

/** The `?r=` token as the server signs it (apps/api/src/notify/links.ts): HMAC over the body. */
function mintToken(secret: string, userId: string, sentAt: string): string {
  const body = Buffer.from(
    JSON.stringify({
      u: userId,
      c: 'email',
      s: sentAt,
      e: Date.parse(sentAt) + 60 * 24 * 60 * 60_000,
    }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(`r1.${body}`).digest('base64url');
  return `r1.${body}.${sig}`;
}
