/// <reference lib="dom" />
/**
 * People for the account specs (auth, onboarding) and the checks every screen of theirs gets. The
 * specs run the real sign-up against the built app and its database: emails go to the server's
 * capture channel, never to Resend, and what an email would carry (a reset link) is read from the
 * database instead. All data is fictional.
 */
import { withClient } from '@netnet/api/db/client';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  VIEWPORTS,
  expectNoHorizontalScroll,
  expectNoSeriousAxeViolations,
  expectTapTargets,
  expectTextAtLeast,
  hitTarget,
  isPhone,
} from './support';

/**
 * A deployment counts sign-ups per real IP address (5 a minute) and its database is out of reach,
 * so these specs run against the local built app only.
 */
export function onlyAgainstTheLocalApp(): void {
  test.skip(
    Boolean(process.env.E2E_BASE_URL),
    'Creates accounts: a deployment limits sign-ups per IP, and reset links come from the local database.',
  );
}

export interface Person {
  readonly email: string;
  readonly password: string;
  /** Their own address for the per-IP limits (x-forwarded-for, which only Vercel overwrites). */
  readonly ip: string;
}

let made = 0;

/** Someone new to NetNet, with a fictional address no other test uses. */
export function newPerson(testInfo: TestInfo): Person {
  made += 1;
  const tag = `${testInfo.project.name}-${testInfo.workerIndex}-${made}-${Date.now().toString(36)}`;
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return {
    email: `person-${tag}@example.com`,
    password: 'correct horse battery',
    ip: `10.${octet()}.${octet()}.${octet()}`,
  };
}

/**
 * Every request from this page comes from the person's own address, and, when given, from a
 * country, as Vercel's IP lookup would say (`x-vercel-ip-country`, what `GET /api/geo` reads).
 */
export async function arriveAs(page: Page, person: Person, country?: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': person.ip,
    ...(country ? { 'x-vercel-ip-country': country } : {}),
  });
}

/**
 * Makes the account through the API (as the sign-up screen does), signed in on this page, and
 * optionally through onboarding. For specs about what comes after.
 */
export async function signedUp(
  page: Page,
  person: Person,
  profile: { country?: string; onboardingState?: 'segment' | 'start' | 'basics' | 'done' } = {},
): Promise<void> {
  // No Origin: a request no browser sent passes the Origin check, and carries no cookie to abuse.
  const headers = { 'x-forwarded-for': person.ip };
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    headers,
    data: { email: person.email, password: person.password, timeZone: 'UTC' },
  });
  expect(signUp.status(), 'sign-up').toBe(200);
  if (Object.keys(profile).length > 0) {
    const patch = await page.request.patch('/api/me', { headers, data: profile });
    expect(patch.status(), 'PATCH /api/me').toBe(200);
  }
}

/** The profile as the API has it now, for the browser's session. */
export async function profileOf(page: Page): Promise<Record<string, unknown>> {
  const response = await page.request.get('/api/me');
  expect(response.status()).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function database<T>(
  work: (query: (sql: string, values: unknown[]) => Promise<unknown[]>) => Promise<T>,
): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('The account specs read the local database: set DATABASE_URL.');
  return withClient(url, (client) =>
    work(async (sql, values) => (await client.query(sql, values)).rows as unknown[]),
  );
}

/** The reset email's link, as a path: its token is read where Better Auth keeps it. */
export async function resetLinkFor(person: Person): Promise<string> {
  const rows = await database((query) =>
    query(
      `select substr(v.identifier, length('reset-password:') + 1) as token
         from core.verification v join core.user u on u.id = v.value
        where u.email = $1 and v.identifier like 'reset-password:%'
        order by v.created_at desc limit 1`,
      [person.email],
    ),
  );
  const token = (rows[0] as { token?: string } | undefined)?.token;
  if (!token) throw new Error('No reset link was made for this person.');
  return `/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent('/app/reset')}`;
}

/** As if the person had opened the verification email's link elsewhere. */
export async function verifiedElsewhere(person: Person): Promise<void> {
  await database((query) =>
    query('update core.user set email_verified = true where email = $1', [person.email]),
  );
}

/** The client events the page sends, in order, as `name` or `name:method`. */
export function recordEvents(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() !== 'POST') return;
    if (pathname === '/api/events') {
      const { name, props } = request.postDataJSON() as {
        name: string;
        props?: { method?: string };
      };
      sent.push(props?.method ? `${name}:${props.method}` : name);
    } else if (pathname === '/api/auth/sign-up/email') {
      sent.push('(sign-up)');
    }
  });
  return sent;
}

/** Every POST /api/events the page sent was accepted. */
export function recordEventAnswers(page: Page): number[] {
  const statuses: number[] = [];
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() === 'POST' && new URL(response.url()).pathname === '/api/events') {
      statuses.push(response.status());
    }
  });
  return statuses;
}

/**
 * Errors the page logs or throws. Asking who is signed in answers 401 to a signed-out visitor,
 * which the browser logs as a failed load: that one is expected, as are the refusals a test asks
 * for (`expected`, matched against the failed request's URL).
 */
export function recordProblems(page: Page, expected: readonly RegExp[] = []): string[] {
  const problems: string[] = [];
  const allowed = [/\/api\/me$/, ...expected];
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const where = message.location().url;
    if (/status of 4\d\d/.test(message.text()) && allowed.some((url) => url.test(where))) return;
    problems.push(`${message.type()}: ${message.text()} (${where})`);
  });
  return problems;
}

/**
 * The checks every account screen gets (CONVENTIONS §9, design-system §6.1, §7): axe, the tap
 * targets, the text floor on a phone, and no sideways scroll at this width or at 320px.
 */
export async function expectSoundScreen(page: Page, testInfo: TestInfo): Promise<void> {
  await expectNoSeriousAxeViolations(page);
  await expectTapTargets(page, hitTarget(testInfo));
  if (isPhone(testInfo)) await expectTextAtLeast(page, 11);
  await expectNoHorizontalScroll(page);
  const size = page.viewportSize();
  await page.setViewportSize(VIEWPORTS.narrow);
  await expectNoHorizontalScroll(page);
  if (size) await page.setViewportSize(size);
}
