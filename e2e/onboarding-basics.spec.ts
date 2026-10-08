/// <reference lib="dom" />
import type { Pack, ValueTuple } from '@netnet/contracts';
import { expect, test, type Page } from '@playwright/test';
import {
  arriveAs,
  expectSoundScreen,
  newPerson,
  onlyAgainstTheLocalApp,
  profileOf,
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

/**
 * Onboarding's second half (PRD J1): the start screen's basics or agent routes, and the basics
 * walking the pack's checklist one question per screen — yes, no, skip, Back, correction,
 * removal, Done for now and resume — with the agent route ending on a blank Home once connected.
 * At 390 and 1280px, against the built app and its database. All data is fictional.
 */
onlyAgainstTheLocalApp();

const heading = (page: Page, name: string | RegExp) =>
  page.getByRole('heading', { level: 1, name });

interface ChecklistItem {
  readonly id: string;
  readonly name: string;
  readonly ask: string;
  readonly amount: string;
  readonly onlyIf?: string;
}

/** The pack's checklist as published: the questions come from content, never from this spec. */
async function checklistOf(page: Page, pack: string): Promise<ChecklistItem[]> {
  const current = (await (await page.request.get('/api/content/current')).json()) as Record<
    string,
    Record<string, number>
  >;
  const version = current['pack']?.[pack];
  expect(version, `a live ${pack} pack`).toBeDefined();
  const doc = (await (
    await page.request.get(`/api/content/pack/${pack}@${version}`)
  ).json()) as Pack;
  return doc.checklist;
}

interface SnapshotSeen {
  readonly holdings: { id: string; name: string; kind: string }[];
  readonly values: Record<string, ValueTuple[]>;
}

/** The holdings and values as the API has them now, for the browser's session. */
async function snapshotOf(page: Page): Promise<SnapshotSeen> {
  const response = await page.request.get('/api/snapshot');
  expect(response.status()).toBe(200);
  return (await response.json()) as SnapshotSeen;
}

/** The checklist item `id` names, failing the test when the pack has no such question. */
function ask(checklist: readonly ChecklistItem[], id: string): ChecklistItem {
  const item = checklist.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`The pack has no checklist item "${id}".`);
  return item;
}

/** The checklist's `at`-th question, failing the test when the pack is shorter. */
function nth(checklist: readonly ChecklistItem[], at: number): ChecklistItem {
  const item = checklist[at];
  if (!item) throw new Error(`The pack has no checklist item ${at}.`);
  return item;
}

/** Answers yes with an amount: the ask screen, then the amount screen, then onward. */
async function answerYes(page: Page, item: ChecklistItem, amount: string): Promise<void> {
  await expect(heading(page, item.ask)).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(heading(page, item.amount)).toBeVisible();
  await page.getByRole('textbox', { name: item.name }).fill(amount);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('the start screen offers the basics or the agent, with Back to the segment', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person, { country: 'SG', onboardingState: 'start' });
  const problems = recordProblems(page);

  await page.goto('/app/onboarding/start');
  await expect(heading(page, /getting to know a little about your finances/)).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(page.getByText('Let your AI agent do this')).toBeVisible();
  const agent = page.getByRole('link', { name: 'Connect to agent' });
  await expect(agent).toHaveAttribute('href', '/app/agent/connect?entry=onboarding');
  await expectSoundScreen(page, testInfo);

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, 'Which is closest to you?')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(heading(page, /getting to know a little about your finances/)).toBeVisible();

  // The agent block opens the same connect flow; Back returns to the start screen.
  await agent.click();
  await expect(heading(page, 'Which AI agent do you use?')).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, /getting to know a little about your finances/)).toBeVisible();

  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(heading(page, 'Do you have money in a bank account?')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/onboarding\/basics\/bank$/);
  await expectSoundScreen(page, testInfo);
  expect(await profileOf(page)).toMatchObject({ onboardingState: 'basics' });
  expect(problems).toStrictEqual([]);
});

test('the full basics: yes, no, skip, back, correction, removal, then Home', async ({
  page,
}, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person, { country: 'SG', onboardingState: 'start' });
  const problems = recordProblems(page);
  const checklist = await checklistOf(page, 'sg');
  expect(checklist.map((item) => item.id)).toStrictEqual([
    'bank',
    'cpf',
    'invest',
    'home',
    'home_loan',
    'car',
    'car_loan',
    'owed',
  ]);
  const byId = (id: string) => ask(checklist, id);

  await page.goto('/app/onboarding/start');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // Yes saves at once; Back shows the answer and corrects it in place.
  await answerYes(page, byId('bank'), '5000');
  await expect(heading(page, byId('cpf').ask)).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, byId('bank').ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  const amount = page.getByRole('textbox', { name: byId('bank').name });
  await expect(amount).toHaveValue('5000');
  await amount.fill('6000');
  await page.getByRole('button', { name: 'Continue' }).click();

  // No saves nothing; Skip saves nothing and Back can return to it.
  await expect(heading(page, byId('cpf').ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(heading(page, byId('invest').ask)).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(heading(page, byId('home').ask)).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, byId('invest').ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  // A follow-up is asked only after its yes; flipping to no removes both.
  await answerYes(page, byId('home'), '200000');
  await expect(heading(page, byId('home_loan').ask)).toBeVisible();
  await answerYes(page, byId('home_loan'), '150000');
  await expect(heading(page, byId('car').ask)).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, byId('home_loan').ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, byId('home').ask)).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(heading(page, byId('car').ask)).toBeVisible();

  // The other follow-up, then the last question finishes on Home.
  await answerYes(page, byId('car'), '30000');
  await expect(heading(page, byId('car_loan').ask)).toBeVisible();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(heading(page, byId('owed').ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done for now' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(heading(page, 'Net worth')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  expect(await profileOf(page)).toMatchObject({ onboardingState: 'done' });

  // What was entered is there, corrected and removed as said; the rest was never asked for.
  const snapshot = await snapshotOf(page);
  expect(snapshot.holdings.map((holding) => holding.name).sort()).toStrictEqual([
    'Bank accounts',
    'Car',
  ]);
  const minorOf = (name: string) => {
    const holding = snapshot.holdings.find((candidate) => candidate.name === name);
    const tuples = holding ? snapshot.values[holding.id] : undefined;
    return tuples?.[tuples.length - 1]?.[1];
  };
  expect(minorOf('Bank accounts')).toBe(600000);
  expect(minorOf('Car')).toBe(3000000);

  // Every yes fired guided; the correction fired corrected.
  const events = await eventsFor(person.email);
  expect(events.filter((event) => event.name === 'holding_created')).toStrictEqual([
    { name: 'holding_created', props: { source: 'web', via: 'guided' } },
    { name: 'holding_created', props: { source: 'web', via: 'guided' } },
    { name: 'holding_created', props: { source: 'web', via: 'guided' } },
    { name: 'holding_created', props: { source: 'web', via: 'guided' } },
  ]);
  expect(events.filter((event) => event.name === 'value_corrected')).toStrictEqual([
    {
      name: 'value_corrected',
      props: { original_source: 'web', age_at_correction: 0 },
    },
  ]);
  expect(problems).toStrictEqual([]);
});

test('Done for now keeps what was entered', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person, { country: 'SG', onboardingState: 'basics' });
  const checklist = await checklistOf(page, 'sg');
  const bank = nth(checklist, 0);

  await page.goto('/app/onboarding/basics');
  await answerYes(page, bank, '5000');
  await page.getByRole('button', { name: 'Done for now' }).click();

  await expect(heading(page, 'Net worth')).toBeVisible();
  expect(await profileOf(page)).toMatchObject({ onboardingState: 'done' });
  const snapshot = await snapshotOf(page);
  expect(snapshot.holdings.map((holding) => holding.name)).toStrictEqual(['Bank accounts']);
});

test('a returning person resumes mid-basics', async ({ page }, testInfo) => {
  const person = newPerson(testInfo);
  await arriveAs(page, person, 'SG');
  await signedUp(page, person, { country: 'SG', onboardingState: 'basics' });
  const checklist = await checklistOf(page, 'sg');
  const bank = nth(checklist, 0);
  const second = nth(checklist, 1);

  await page.goto('/app/onboarding/basics');
  await answerYes(page, bank, '5000');
  await expect(heading(page, second.ask)).toBeVisible();

  await page.context().clearCookies();
  await page.goto('/app/login');
  await page.getByLabel('Email').fill(person.email);
  await page.getByLabel('Password', { exact: true }).fill(person.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(heading(page, second.ask)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/onboarding/basics/${second.id}$`));

  // Back still shows the answer saved before leaving.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(heading(page, bank.ask)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText(/Saved/)).toBeVisible();
});

test.describe('the agent route', () => {
  test.skip(!process.env.DATABASE_URL, 'reads the local database (DATABASE_URL)');

  test('ends on a blank Home with no waiting state once connected', async ({
    page,
    request,
  }, testInfo) => {
    const person = newPerson(testInfo);
    await arriveAs(page, person, 'SG');
    await signedUp(page, person, { country: 'SG', onboardingState: 'start' });
    await verifiedElsewhere(person);
    const problems = recordProblems(page, [/\/content\/images\//]);
    const server = await discoverServer(request);

    await page.goto('/app/onboarding/start');
    await page.getByRole('link', { name: 'Connect to agent' }).click();
    await expect(heading(page, 'Which AI agent do you use?')).toBeVisible();
    await page.getByRole('link', { name: 'Claude' }).click();
    await expect(heading(page, 'Connect Claude')).toBeVisible();
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
    await approval.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(approval.getByText('Back in the agent.')).toBeVisible();
    const back = new URL(approval.url());
    const code = back.searchParams.get('code') ?? '';
    expect(code).not.toBe('');
    await approval.close();

    // The code exchanges, the steps move on, and the route ends on a blank Home.
    await exchangeCode(request, agent, server, code);
    await expect(page.getByText('Claude is connected.', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Continue to Home' }).click();
    await expect(heading(page, 'Net worth')).toBeVisible();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    expect(await profileOf(page)).toMatchObject({ onboardingState: 'done' });

    const events = await eventsFor(person.email);
    expect(events.find((event) => event.name === 'agent_connection_started')).toMatchObject({
      props: { client: 'claude', entry: 'onboarding' },
    });
    expect(events.find((event) => event.name === 'agent_connection_completed')).toMatchObject({
      props: { client: 'other', entry: 'onboarding' },
    });
    expect(problems).toStrictEqual([]);
  });
});
