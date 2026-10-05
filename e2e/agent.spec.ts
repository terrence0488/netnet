/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  recordProblems,
  signedUp,
  verifiedElsewhere,
} from './accounts';
import {
  FAKE_AGENT_CALLBACK,
  authorizeUrl,
  discoverServer,
  eventsFor,
  exchangeCode,
  registerFakeAgent,
} from './agent';
import { SIGNED_IN } from './support';

/**
 * The Agent tab and the connect flow (PRD J5), at 390 and 1280px: choosing the agent, the steps
 * for this platform with the connector URL, the approval, and the screen moving on by itself;
 * every failure's cause with its retry; reduced motion; axe; the events. The screen states run
 * against scripted answers (here and on previews); the full connection and the cancel run the
 * fake agent against the real server, locally only. All data is fictional.
 */

const CLAUDE_DOC = {
  id: 'claude',
  name: 'Claude',
  logo: 'images/agents/claude.svg',
  listed: true,
  order: 1,
  platforms: {
    phone: {
      steps: [
        {
          text: 'In the Claude app, open **Settings → Connectors**.',
          image: 'images/connect/claude-phone-1.png',
        },
        {
          text: 'Tap **Add custom connector**. Name it NetNet and paste NetNet’s connector address.',
          image: 'images/connect/claude-phone-2.png',
        },
        {
          text: 'Tap **Connect**, then **Allow** on the NetNet page that opens.',
          image: 'images/connect/claude-phone-3.png',
        },
      ],
    },
    computer: {
      steps: [
        {
          text: 'In Claude, open **Settings → Connectors**.',
          image: 'images/connect/claude-computer-1.png',
        },
        {
          text: 'Choose **Add custom connector**. Name it NetNet and paste NetNet’s connector address.',
          image: 'images/connect/claude-computer-2.png',
        },
        {
          text: 'Press **Connect**, then **Allow** on the NetNet page that opens.',
          image: 'images/connect/claude-computer-3.png',
        },
      ],
    },
  },
};

const OTHER_DOC = {
  id: 'other',
  name: 'Other agent',
  listed: true,
  order: 3,
  platforms: {
    any: {
      steps: [
        { text: 'In your agent’s settings, add a **custom connector**.' },
        { text: 'Name it NetNet and use NetNet’s connector address.' },
        { text: 'Approve it, then press **Allow** on the NetNet page that opens.' },
      ],
    },
  },
};

const CHATGPT_DOC = {
  id: 'chatgpt',
  name: 'ChatGPT',
  logo: 'images/agents/chatgpt.svg',
  listed: false,
  order: 2,
  platforms: { computer: { steps: [{ text: 'In ChatGPT, open **Settings**.' }] } },
};

interface Scripted {
  /** Answers for POST /api/agent/attempts, one per attempt started. */
  posts: { id: string; state: string }[];
  /** Answers for GET /api/agent/attempts/:id, in order; the last repeats. */
  reads: { failedStep?: string; cause?: string; state: string }[];
}

/**
 * The app as a signed-in person sees it, with the guides, connections and attempts scripted and
 * the client events captured. `me` may be a function, so a test can verify the email halfway.
 */
async function asConnectable(
  page: Page,
  options: {
    me?: Record<string, unknown> | (() => Record<string, unknown>);
    connections?: Record<string, unknown>[];
    attempts?: Scripted;
  } = {},
) {
  const events: { name: string; props: unknown }[] = [];
  let connections = options.connections ?? [];
  const attempts = options.attempts ?? {
    posts: [{ id: 'att_test_1', state: 'started' }],
    reads: [],
  };
  let post = 0;
  let read = 0;
  const counts = { posts: 0 };
  const me = options.me ?? SIGNED_IN;

  await page.route('**/api/me', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: typeof me === 'function' ? me() : me });
    }
    return route.continue();
  });
  await page.route('**/api/events', (route) => {
    events.push(route.request().postDataJSON() as { name: string; props: unknown });
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/content/current', (route) =>
    route.fulfill({ json: { agent: { claude: 1, chatgpt: 1, other: 1 } } }),
  );
  await page.route('**/api/content/agent/*', (route) => {
    const key = new URL(route.request().url()).pathname.split('/').pop()?.split('@')[0];
    const doc = key === 'claude' ? CLAUDE_DOC : key === 'other' ? OTHER_DOC : CHATGPT_DOC;
    return route.fulfill({ json: doc });
  });
  await page.route('**/api/agent/connections', (route) => route.fulfill({ json: connections }));
  await page.route('**/api/agent/connections/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    const id = new URL(route.request().url()).pathname.split('/').pop();
    connections = connections.filter((c) => c['id'] !== id);
    return route.fulfill({ json: { result: null, dataVersion: 1, warnings: [] } });
  });
  await page.route('**/api/agent/attempts', (route) => {
    counts.posts += 1;
    const next = attempts.posts[Math.min(post, attempts.posts.length - 1)] ?? {
      id: `att_test_${post + 1}`,
      state: 'started',
    };
    post += 1;
    return route.fulfill({ status: 201, json: next });
  });
  await page.route('**/api/agent/attempts/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const next = attempts.reads[Math.min(read, attempts.reads.length - 1)] ?? { state: 'started' };
    read += 1;
    return route.fulfill({ json: { id, ...next } });
  });
  return { events, counts };
}

/** The connect events the page sent, leaving the session's own out. */
function startedEvents(events: { name: string; props: unknown }[]): unknown[] {
  return events.filter((event) => event.name === 'agent_connection_started');
}

/** Images under `selector` that never loaded: none on screen may be broken. */
function brokenImages(page: Page, selector: string): Promise<number> {
  return page.evaluate((selector) => {
    const images = [...document.querySelectorAll(selector)].filter(
      (node): node is HTMLImageElement => node instanceof HTMLImageElement,
    );
    return images.filter((img) => !img.complete || img.naturalWidth === 0).length;
  }, selector);
}

/** Which face of the agent roll is lit (opacity 1), or -1 mid-turn. */
function litFace(page: Page): Promise<number> {
  return page.evaluate(() => {
    const faces = [...document.querySelectorAll('[data-testid="agent-roll"] > i')];
    return faces.findIndex((face) => getComputedStyle(face).opacity === '1');
  });
}

const CONNECTIONS = [
  {
    id: 'con_01KFJ0Z000000000000000000',
    clientName: 'Claude',
    client: 'claude',
    registration: 'cimd',
    nameVerified: true,
    createdAt: '2026-09-12T09:00:00.000Z',
    lastUsedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: 'con_01KFJ0Z000000000000000001',
    clientName: 'Fictional helper',
    client: 'other',
    registration: 'dcr',
    nameVerified: false,
    createdAt: '2026-10-01T09:00:00.000Z',
    lastUsedAt: null,
  },
];

test('the empty Agent tab offers the flow, its icon turning through the agents’ logos', async ({
  page,
}, testInfo) => {
  await asConnectable(page, { connections: [] });
  const problems = recordProblems(page);
  await page.goto('/app/agent');

  await expect(page.getByRole('heading', { level: 1, name: 'Your agent' })).toBeVisible();
  await expect(page.getByText('Works with Claude, or any agent that supports MCP.')).toBeVisible();
  const button = page.getByRole('link', { name: 'Connect to agent', exact: true });
  await expect(button).toBeVisible();
  const roll = page.getByTestId('agent-roll');
  // The generic icon, then Claude's logo; the unlisted and the logo-less guides add no face.
  await expect(roll.locator(':scope > i')).toHaveCount(2);
  await expect.poll(() => litFace(page), { timeout: 3000 }).toBe(0);
  await expect.poll(() => litFace(page), { timeout: 8000 }).toBe(1);

  await button.click();
  await expect(page).toHaveURL(/\/app\/agent\/connect\?entry=agent$/);
  await expect(page.getByRole('heading', { name: 'Which AI agent do you use?' })).toBeVisible();
  await expectSoundScreen(page, testInfo);
  expect(problems).toStrictEqual([]);
});

test('the Agent tab lists connections with their times, and revokes with a confirmation', async ({
  page,
}, testInfo) => {
  await asConnectable(page, { connections: [...CONNECTIONS] });
  const problems = recordProblems(page);
  await page.goto('/app/agent');

  const first = page.locator('main').getByText('Claude', { exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByText(/Connected .* · Last used /).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fictional helper' })).toBeVisible();
  await expect(page.getByText(/not used yet/)).toBeVisible();
  // Claude is connected, so only another agent is offered.
  await expect(page.getByRole('heading', { name: 'Connect another' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect Claude' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Connect another agent' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Revoke' }).first().click();
  await expect(page.getByRole('heading', { name: 'Disconnect Claude?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('heading', { name: 'Disconnect Claude?' })).toHaveCount(0);
  await expect(page.getByText('Claude', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Revoke' }).first().click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByText('Claude is disconnected.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fictional helper' })).toBeVisible();
  await expect(page.getByText('Claude', { exact: true })).toHaveCount(0);
  // Claude is offered again now that it is gone.
  await expect(page.getByRole('link', { name: 'Connect Claude' })).toBeVisible();
  expect(problems).toStrictEqual([]);
});

test('a logo file that fails to load shows the agent’s initial, never a broken image', async ({
  page,
}) => {
  await page.route('**/content/images/agents/claude.svg', (route) => route.abort());
  await asConnectable(page, { connections: [] });
  await page.goto('/app/agent/connect');
  const row = page.getByRole('link', { name: 'Claude' });
  await expect(row).toBeVisible();
  await expect(row.locator('img')).toHaveCount(0);
  // Every image still on screen loaded.
  await expect.poll(() => brokenImages(page, 'img')).toBe(0);
});

test('the choice lists the offered guides in order, Back to where it began', async ({
  page,
}, testInfo) => {
  await asConnectable(page);
  const problems = recordProblems(page);
  await page.goto('/app/agent/connect?entry=agent');

  const rows = page.getByRole('group', { name: 'Which AI agent do you use?' }).getByRole('link');
  await expect(rows).toHaveText([/Claude/, /Other agent/]);
  await expect(page.getByText('ChatGPT')).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/app\/agent$/);

  await page.goto('/app/agent/connect?entry=home');
  await expect(page.getByRole('heading', { name: 'Which AI agent do you use?' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(problems).toStrictEqual([]);
});

test('an agent that is not offered, even by its address: the list instead', async ({ page }) => {
  await asConnectable(page);
  await page.goto('/app/agent/connect/chatgpt?entry=agent');
  await expect(page.getByRole('heading', { name: 'Which AI agent do you use?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Claude' })).toBeVisible();
});

/** A 1px PNG, standing in for a setup screenshot until F11 drops the real ones in. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('the steps show this platform’s guide, the connector address, and wait', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/content/images/connect/*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );
  const { events, counts } = await asConnectable(page, {
    attempts: { posts: [{ id: 'att_test_1', state: 'started' }], reads: [{ state: 'started' }] },
  });
  const problems = recordProblems(page);
  await page.goto('/app/agent/connect/claude?entry=agent');

  await expect(page.getByRole('heading', { name: 'Connect Claude' })).toBeVisible();
  const group = page.getByRole('group', { name: 'Setup steps for' });
  const phone = group.getByRole('button', { name: 'On a phone' });
  const computer = group.getByRole('button', { name: 'On a computer' });
  // One platform is shown; switching shows the other's steps.
  const pressed = (await phone.getAttribute('aria-pressed')) === 'true' ? phone : computer;
  const other = pressed === phone ? computer : phone;
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  const before = await page.locator('ol li').first().innerText();
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('ol li').first().innerText()).not.toBe(before);

  // A screenshot per step, each one loaded.
  await expect(page.locator('ol figure img')).toHaveCount(3);
  await expect.poll(() => brokenImages(page, 'ol figure img')).toBe(0);
  await expect(page.getByText('Screenshot coming soon')).toHaveCount(0);

  // The connector URL with Copy.
  await expect(page.getByText(`${baseURL}/mcp`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/mcp`);

  // No "I've done it" button: the screen waits for the approval.
  await expect(page.getByText(/moves on by itself/)).toBeVisible();
  expect(counts.posts).toBe(1);
  expect(startedEvents(events)).toStrictEqual([
    { name: 'agent_connection_started', props: { client: 'claude', entry: 'agent' } },
  ]);
  await expectSoundScreen(page, testInfo);
  expect(problems).toStrictEqual([]);
});

test('missing screenshots show a neutral placeholder, never a broken image', async ({ page }) => {
  await page.route('**/content/images/connect/*', (route) => route.fulfill({ status: 404 }));
  await asConnectable(page);
  const problems = recordProblems(page, [/\/content\/images\//]);
  await page.goto('/app/agent/connect/claude?entry=agent');

  await expect(page.getByText('Screenshot coming soon')).toHaveCount(3);
  await expect(page.locator('ol figure img')).toHaveCount(0);
  expect(problems).toStrictEqual([]);
});

test('“Other agent” has one set of steps, no platform switch and no screenshots', async ({
  page,
}, testInfo) => {
  await asConnectable(page);
  await page.goto('/app/agent/connect/other?entry=home');

  await expect(page.getByRole('heading', { name: 'Connect your agent' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Setup steps for' })).toHaveCount(0);
  await expect(page.locator('ol li')).toHaveCount(3);
  await expect(page.locator('ol img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expectSoundScreen(page, testInfo);

  // Back returns step by step to where it began.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Which AI agent do you use?' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

const FAILURES = [
  {
    cause: 'cancelled',
    step: 'authorise',
    title: 'The connection was cancelled.',
    detail: /pressed Cancel/,
  },
  {
    cause: 'invalid_request',
    step: 'authorise',
    title: 'Your agent’s request wasn’t accepted.',
    detail: /couldn’t verify it/,
  },
  {
    cause: 'token_rejected',
    step: 'callback',
    title: 'Your agent couldn’t finish signing in.',
    detail: /wasn’t accepted/,
  },
  {
    cause: 'timed_out',
    step: 'first_call',
    title: 'This step took too long.',
    detail: /15 minutes/,
  },
] as const;

for (const failure of FAILURES) {
  test(`a failure shows its plain-language cause and a retry: ${failure.cause}`, async ({
    page,
  }) => {
    const { events, counts } = await asConnectable(page, {
      attempts: {
        posts: [
          { id: 'att_test_1', state: 'started' },
          { id: 'att_test_2', state: 'started' },
        ],
        reads: [
          { state: 'failed', failedStep: failure.step, cause: failure.cause },
          { state: 'started' },
        ],
      },
    });
    await page.goto('/app/agent/connect/claude?entry=agent');

    await expect(page.getByRole('heading', { name: failure.title })).toBeVisible();
    await expect(page.getByText(failure.detail)).toBeVisible();
    if (failure.cause.includes('_')) {
      await expect(page.getByText(failure.cause)).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(/moves on by itself/)).toBeVisible();
    expect(counts.posts).toBe(2);
    expect(startedEvents(events)).toStrictEqual([
      { name: 'agent_connection_started', props: { client: 'claude', entry: 'agent' } },
      { name: 'agent_connection_started', props: { client: 'claude', entry: 'agent' } },
    ]);
  });
}

for (const state of ['approved', 'live'] as const) {
  test(`the screen moves on by itself once the agent is ${state}`, async ({ page }) => {
    await asConnectable(page, {
      attempts: {
        posts: [{ id: 'att_test_1', state: 'started' }],
        reads: [{ state: 'started' }, { state }],
      },
    });
    await page.goto('/app/agent/connect/claude?entry=agent');

    await expect(page.getByText('Claude is connected.', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('link', { name: 'Back to the Agent tab' }).click();
    await expect(page).toHaveURL(/\/app\/agent$/);
  });
}

test('an unverified email verifies first, with resend, and the flow carries on by itself', async ({
  page,
}) => {
  let verified = false;
  const me = () => ({ ...SIGNED_IN, emailVerified: verified });
  await asConnectable(page, { me });
  await page.route('**/api/auth/send-verification-email', (route) =>
    route.fulfill({ json: { status: true } }),
  );
  await page.goto('/app/agent/connect/claude?entry=agent');

  await expect(page.getByRole('heading', { name: 'Verify your email first' })).toBeVisible();
  await expect(page.getByText(SIGNED_IN.email)).toBeVisible();
  await page.getByRole('button', { name: 'Resend the link' }).click();
  await expect(page.getByText('Sent again.')).toBeVisible();

  verified = true;
  await expect(page.getByRole('heading', { name: 'Connect Claude' })).toBeVisible({
    timeout: 15000,
  });
});

const APPROVAL = {
  clientName: 'Fictional E2E agent',
  registration: 'dcr',
  nameVerified: false,
  client: 'other',
  host: '127.0.0.1',
  scopes: ['ledger.read', 'ledger.write', 'openid', 'offline_access'],
};

/** The approval page's API, scripted, capturing the decisions. */
async function mockApproval(page: Page, approval: Record<string, unknown> = APPROVAL) {
  const decisions: unknown[] = [];
  await page.route('**/api/agent/approval*', (route) => {
    if (route.request().method() === 'POST') {
      decisions.push(route.request().postDataJSON());
      return route.fulfill({ json: { url: `${FAKE_AGENT_CALLBACK}?code=fake&state=x` } });
    }
    return route.fulfill({ json: approval });
  });
  return { decisions };
}

test('the approval names who is asking, with the DCR caveat and the ledger scopes only', async ({
  page,
}, testInfo) => {
  await asConnectable(page);
  const { decisions } = await mockApproval(page);
  await page.route(`${FAKE_AGENT_CALLBACK}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'Back in the agent.' }),
  );
  const problems = recordProblems(page);
  await page.goto('/app/connect/approve?client_id=x&sig=y');

  await expect(
    page.getByRole('heading', { name: 'Fictional E2E agent wants to connect to your NetNet' }),
  ).toBeVisible();
  await expect(page.getByText('Signed in as avery@example.com')).toBeVisible();
  await expect(page.getByText('NetNet can’t verify this name')).toBeVisible();
  await expect(page.getByText(/See your holdings and their history/)).toBeVisible();
  await expect(page.getByText(/Add or update them/)).toBeVisible();
  await expect(page.getByText('openid')).toHaveCount(0);
  await expect(page.getByText('offline_access')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expectSoundScreen(page, testInfo);

  await page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(page.getByText('Back in the agent.')).toBeVisible();
  const query = (decisions[0] as { query?: string })?.query ?? '';
  expect(decisions).toStrictEqual([{ accept: true, query }]);
  expect(query).toContain('client_id=x');
  expect(problems).toStrictEqual([]);
});

test('Cancel on the approval tells the agent no', async ({ page }) => {
  await asConnectable(page);
  const { decisions } = await mockApproval(page);
  await page.route(`${FAKE_AGENT_CALLBACK}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'Back in the agent.' }),
  );
  await page.goto('/app/connect/approve?client_id=x&sig=y');

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Back in the agent.')).toBeVisible();
  expect((decisions[0] as { accept?: boolean })?.accept).toBe(false);
});

test('a verified name shows no caveat', async ({ page }) => {
  await asConnectable(page);
  await mockApproval(page, { ...APPROVAL, registration: 'cimd', nameVerified: true });
  await page.goto('/app/connect/approve?client_id=x&sig=y');

  await expect(
    page.getByRole('heading', { name: 'Fictional E2E agent wants to connect to your NetNet' }),
  ).toBeVisible();
  await expect(page.getByText('can’t verify this name')).toHaveCount(0);
});

test('an expired approval says to start again at the agent', async ({ page }) => {
  await asConnectable(page);
  await page.route('**/api/agent/approval*', (route) =>
    route.fulfill({
      status: 400,
      json: { error: { code: 'VALIDATION_FAILED', message: 'Expired.', fields: {} } },
    }),
  );
  const problems = recordProblems(page, [/\/api\/agent\/approval/]);
  await page.goto('/app/connect/approve?client_id=x&sig=y');

  await expect(page.getByRole('heading', { name: 'This approval has expired.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Allow', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Or open the Agent tab.' }).click();
  await expect(page).toHaveURL(/\/app\/agent$/);
  expect(problems).toStrictEqual([]);
});

test('the approval asks an unverified email to verify first', async ({ page }) => {
  let verified = false;
  await asConnectable(page, { me: () => ({ ...SIGNED_IN, emailVerified: verified }) });
  await mockApproval(page);
  await page.goto('/app/connect/approve?client_id=x&sig=y');

  await expect(page.getByRole('heading', { name: 'Verify your email first' })).toBeVisible();
  verified = true;
  await expect(
    page.getByRole('heading', { name: 'Fictional E2E agent wants to connect to your NetNet' }),
  ).toBeVisible({ timeout: 15000 });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the icon holds still, and the flow still works', async ({ page }, testInfo) => {
    await asConnectable(page, { connections: [] });
    await page.goto('/app/agent');

    const roll = page.getByTestId('agent-roll');
    await expect(roll.locator(':scope > i')).toHaveCount(2);
    await expect.poll(() => litFace(page), { timeout: 3000 }).toBe(0);
    await page.waitForTimeout(2600);
    expect(await litFace(page)).toBe(0);

    await page.getByRole('link', { name: 'Connect to agent', exact: true }).click();
    await page.getByRole('link', { name: 'Claude' }).click();
    await expect(page.getByRole('heading', { name: 'Connect Claude' })).toBeVisible();
    await expectSoundScreen(page, testInfo);
  });
});

test.describe('against the real server', () => {
  onlyAgainstTheLocalApp();
  test.skip(!process.env.DATABASE_URL, 'reads the local database (DATABASE_URL)');

  test('a full connection, through the app, with the fake agent', async ({
    page,
    request,
    baseURL,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person, 'SG');
    await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
    await verifiedElsewhere(person);
    const problems = recordProblems(page, [/\/content\/images\//]);
    const server = await discoverServer(request);
    expect(server.resource).toBe(`${baseURL}/mcp`);

    await page.goto('/app/agent');
    await expect(page.getByRole('heading', { level: 1, name: 'Your agent' })).toBeVisible();
    await page.getByRole('link', { name: 'Connect to agent', exact: true }).click();
    // The real guides: Claude and Other agent, with ChatGPT unlisted.
    await expect(page.getByRole('link', { name: 'Claude' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Other agent' })).toBeVisible();
    await expect(page.getByText('ChatGPT')).toHaveCount(0);

    await page.getByRole('link', { name: 'Claude' }).click();
    await expect(page.getByRole('heading', { name: 'Connect Claude' })).toBeVisible();
    await expect(page.getByText(`${baseURL}/mcp`, { exact: true })).toBeVisible();
    await expect(page.getByText(/moves on by itself/)).toBeVisible();
    await expectSoundScreen(page, testInfo);

    // The fake agent registers, and the person approves it in a second tab.
    const agent = await registerFakeAgent(request, server);
    await page
      .context()
      .route(`${FAKE_AGENT_CALLBACK}**`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/plain', body: 'Back in the agent.' }),
      );
    const approval = await page.context().newPage();
    await approval.goto(authorizeUrl(agent, server));
    await expect(approval).toHaveURL(/\/app\/connect\/approve/);
    await expect(
      approval.getByRole('heading', { name: `${agent.name} wants to connect to your NetNet` }),
    ).toBeVisible();
    await expect(approval.getByText('NetNet can’t verify this name')).toBeVisible();
    await approval.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(approval.getByText('Back in the agent.')).toBeVisible();
    const back = new URL(approval.url());
    expect(back.searchParams.get('state')).toBe(agent.state);
    const code = back.searchParams.get('code') ?? '';
    expect(code).not.toBe('');
    await approval.close();

    // The code exchanges, and the steps move on by themselves.
    const { refreshToken } = await exchangeCode(request, agent, server, code);
    await expect(page.getByText('Claude is connected.', { exact: true })).toBeVisible({
      timeout: 15000,
    });

    // The Agent tab lists it, and the funnel reads started then completed.
    await page.getByRole('link', { name: 'Back to the Agent tab' }).click();
    await expect(page.getByRole('heading', { name: agent.name })).toBeVisible();
    await expect(page.getByText(/Connected .* · Last used /)).toBeVisible();
    const events = await eventsFor(person.email);
    expect(events.find((event) => event.name === 'agent_connection_started')).toMatchObject({
      props: { client: 'claude', entry: 'agent' },
    });
    // The server classifies the fake agent as what it is: other.
    expect(events.find((event) => event.name === 'agent_connection_completed')).toMatchObject({
      props: { client: 'other', entry: 'agent' },
    });

    // Revoking it stops the refresh token.
    await page.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText(`${agent.name} is disconnected.`)).toBeVisible();
    await expect(page.getByRole('heading', { name: agent.name })).toHaveCount(0);
    const refreshed = await request.post(server.tokenEndpoint, {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: agent.clientId,
        resource: server.resource,
      },
    });
    expect(((await refreshed.json()) as { error?: string }).error).toBe('invalid_grant');
    expect(problems).toStrictEqual([]);
  });

  test('Cancel on the approval fails the attempt with its cause', async ({
    page,
    request,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person, 'SG');
    await signedUp(page, person, { country: 'SG', onboardingState: 'done' });
    await verifiedElsewhere(person);
    const server = await discoverServer(request);
    await page.goto('/app/agent/connect/claude?entry=agent');
    await expect(page.getByText(/moves on by itself/)).toBeVisible();

    const agent = await registerFakeAgent(request, server);
    await page
      .context()
      .route(`${FAKE_AGENT_CALLBACK}**`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/plain', body: 'Back in the agent.' }),
      );
    const approval = await page.context().newPage();
    await approval.goto(authorizeUrl(agent, server));
    await approval.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(approval.getByText('Back in the agent.')).toBeVisible();
    expect(new URL(approval.url()).searchParams.get('error')).toBe('access_denied');
    await approval.close();

    await expect(page.getByRole('heading', { name: 'The connection was cancelled.' })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(/moves on by itself/)).toBeVisible();
  });
});
