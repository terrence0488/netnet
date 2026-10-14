/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import { expectSoundScreen, recordProblems } from './accounts';
import { asSignedIn, mockConnections, mockPacks, mockSnapshot } from './support';

/**
 * Web push (PRD J12, architecture §7.10, CONVENTIONS §9): the Home card's ask and Not nows, the
 * tap-only permission, Settings → Notifications, the session check-in, and what sign-out leaves
 * behind. The browser's push APIs are stubbed per test; the API routes are mocked. All data is
 * fictional.
 */
test.use({ timezoneId: 'UTC' });

const LEDGER = {
  dataVersion: 3,
  baseCurrency: 'SGD',
  packRef: [{ key: 'generic', version: 1 }],
  prefs: {},
  types: [
    {
      id: 'typ_cash',
      universal: 'cash',
      packTypeKey: null,
      customName: null,
      sort: 0,
      archived: false,
    },
    {
      id: 'typ_listed',
      universal: 'listed',
      packTypeKey: null,
      customName: null,
      sort: 1,
      archived: false,
    },
  ],
  tags: [],
  holdings: [
    {
      id: 'hld_cash',
      kind: 'asset',
      name: 'Everyday savings',
      typeId: 'typ_cash',
      currency: 'SGD',
      cadenceDays: null,
      archived: false,
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      rowVersion: 1,
      access: 'accessible',
      accessReason: null,
      accessUntil: null,
      accessBasis: null,
      tagIds: [],
    },
    {
      id: 'hld_broker',
      kind: 'asset',
      name: 'Brokerage account',
      typeId: 'typ_listed',
      currency: 'USD',
      cadenceDays: null,
      archived: false,
      archivedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      rowVersion: 1,
      access: 'accessible',
      accessReason: null,
      accessUntil: null,
      accessBasis: null,
      tagIds: [],
    },
  ],
  values: {
    hld_cash: [['2026-09-20', 125_000, 'SGD', 125_000, 'web', null, 'val_cash']],
    hld_broker: [['2026-09-21', 50_000_000, 'USD', 67_500_000, 'web', null, 'val_broker']],
  },
};

const PREFS = {
  reminders: true,
  email: true,
  emailVerified: true,
  devices: [
    {
      id: 'nep_01K1G4KX00BBBBBBBBBBBBBBBB',
      label: 'macOS · Safari',
      platform: 'desktop',
      lastSeenAt: '2026-09-20T10:00:00.000Z',
    },
  ],
};

const SUBSCRIPTION = {
  endpoint: 'https://push.example.net/push/e2e-device',
  keys: { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' },
};

async function mockLedger(page: Page): Promise<void> {
  await asSignedIn(page);
  await mockSnapshot(page, LEDGER);
  await mockPacks(page);
  await mockConnections(page, []);
}

async function mockPrefs(page: Page, prefs: unknown = PREFS): Promise<void> {
  await page.route('**/api/notifications/prefs', (route) => route.fulfill({ json: prefs }));
}

/** The prompt events' props, in order: `{name, entry, result?}`. */
function recordPromptEvents(
  page: Page,
): { name: string; entry?: string | undefined; result?: string | undefined }[] {
  const sent: { name: string; entry?: string | undefined; result?: string | undefined }[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (new URL(request.url()).pathname !== '/api/events') return;
    const body = request.postDataJSON() as {
      name: string;
      props?: { entry?: string; result?: string };
    };
    if (body.name === 'push_prompt_shown' || body.name === 'push_prompt_result') {
      sent.push({ name: body.name, entry: body.props?.entry, result: body.props?.result });
    }
  });
  return sent;
}

/** A capable browser with the permission at `state`. Chromium can really receive push. */
async function capableBrowser(page: Page, state: 'default' | 'granted' | 'denied'): Promise<void> {
  await page.addInitScript((permission) => {
    Object.defineProperty(window.Notification, 'permission', {
      value: permission,
      configurable: true,
    });
  }, state);
}

/** No service worker, PushManager or Notification: an iPhone in a Safari tab, say. */
async function incapableBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const name of ['PushManager', 'Notification'] as const) {
      Object.defineProperty(window, name, { value: undefined, configurable: true });
    }
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  });
}

/** A subscription the Turn on tap gets, without reaching a push service. */
async function fakeSubscription(page: Page): Promise<void> {
  await page.addInitScript((subscription) => {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      toJSON: () => ({ endpoint: subscription.endpoint, keys: subscription.keys }),
      unsubscribe: () => Promise.resolve(true),
    };
    const pushManager = {
      subscribe: () => Promise.resolve(pushSubscription),
      getSubscription: () => Promise.resolve(pushSubscription),
    };
    const registration = { pushManager };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: () => Promise.resolve(registration),
        getRegistration: () => Promise.resolve(registration),
      },
      configurable: true,
    });
  }, SUBSCRIPTION);
}

test.describe('the Home card', () => {
  test('asks once and gently below the Position ledger', async ({ page }, testInfo) => {
    const problems = recordProblems(page);
    await capableBrowser(page, 'default');
    await mockLedger(page);
    const prompts = recordPromptEvents(page);
    await page.goto('/app/');
    const card = page.getByTestId('push-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(
      'Want a gentle nudge on this device if you haven’t looked in a while?',
    );
    // Below the Position ledger.
    const ledger = page.getByRole('heading', { name: /Position/ });
    expect(await ledger.boundingBox().then((box) => box?.y ?? 0)).toBeLessThan(
      await card.boundingBox().then((box) => box?.y ?? 0),
    );
    await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not now' })).toBeVisible();
    await expect
      .poll(() => prompts)
      .toContainEqual({ name: 'push_prompt_shown', entry: 'home', result: undefined });
    await expectSoundScreen(page, testInfo);
    expect(problems).toEqual([]);
  });

  test('Not now hides the card for 30 days, a second for good', async ({ page }) => {
    await capableBrowser(page, 'default');
    await mockLedger(page);
    const prompts = recordPromptEvents(page);
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByTestId('push-card')).toBeHidden();
    await expect
      .poll(() => prompts)
      .toContainEqual({ name: 'push_prompt_result', entry: 'home', result: 'not_now' });

    await page.reload();
    await expect(page.getByTestId('push-card')).toBeHidden();

    // The first dismissal expires: the card asks once more, then never again.
    await page.evaluate(() => {
      window.localStorage.setItem(
        'netnet.pushPrompt',
        JSON.stringify({ dismissals: 1, hiddenUntil: '2020-01-01T00:00:00.000Z' }),
      );
    });
    await page.reload();
    await expect(page.getByTestId('push-card')).toBeVisible();
    await page.getByRole('button', { name: 'Not now' }).click();
    const stored = await page.evaluate(() => window.localStorage.getItem('netnet.pushPrompt'));
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ dismissals: 2, hiddenUntil: null });
    await page.reload();
    await expect(page.getByTestId('push-card')).toBeHidden();
  });

  test('Turn on subscribes from the tap and confirms in one line', async ({ page }) => {
    await capableBrowser(page, 'default');
    await fakeSubscription(page);
    await mockLedger(page);
    await page.route('**/api/notifications/vapid-key', (route) =>
      route.fulfill({ json: { publicKey: 'BEl64zVAPIDpublicKeyForTestsOnly0123456789_-testkey' } }),
    );
    const posted: unknown[] = [];
    await page.route('**/api/notifications/endpoints', (route) => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' } });
    });
    const prompts = recordPromptEvents(page);
    await page.goto('/app/');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByTestId('push-card-result')).toHaveText(
      'Notifications are on for this device.',
    );
    expect(posted).toEqual([
      {
        endpoint: SUBSCRIPTION.endpoint,
        keys: SUBSCRIPTION.keys,
        platform: 'desktop',
        deviceLabel: expect.stringMatching(/ · /),
      },
    ]);
    await expect
      .poll(() => prompts)
      .toContainEqual({ name: 'push_prompt_result', entry: 'home', result: 'granted' });
    expect(await page.evaluate(() => window.localStorage.getItem('netnet.pushEndpointId'))).toBe(
      'nep_01K1G4KX00AAAAAAAAAAAAAAAA',
    );
  });

  test('stays hidden where push cannot work', async ({ page }) => {
    // An incapable browser: no card, and no Home Screen how-to anywhere.
    await incapableBrowser(page);
    await mockLedger(page);
    await page.goto('/app/');
    await expect(page.getByTestId('push-card')).toBeHidden();
    await expect(page.getByText(/Home Screen/)).toBeHidden();
  });

  test('stays hidden once the device has decided', async ({ page }) => {
    await capableBrowser(page, 'default');
    await mockLedger(page);
    // Push on: the endpoint id is saved.
    await page.goto('/app/');
    await page.evaluate(() => {
      window.localStorage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    });
    await page.reload();
    await expect(page.getByTestId('push-card')).toBeHidden();
  });

  test('stays hidden when permission is granted or denied, and with no picture', async ({
    page,
  }) => {
    await capableBrowser(page, 'granted');
    await mockLedger(page);
    await page.goto('/app/');
    await expect(page.getByTestId('push-card')).toBeHidden();

    // No first picture: an empty ledger never asks.
    await capableBrowser(page, 'default');
    await page.route('**/api/snapshot*', (route) =>
      route.fulfill({ json: { ...LEDGER, holdings: [], values: {} } }),
    );
    await page.reload();
    await expect(page.getByTestId('push-card')).toBeHidden();
  });

  test('never asks for permission except inside the tap', async ({ page }) => {
    await capableBrowser(page, 'default');
    await mockLedger(page);
    await mockPrefs(page);
    await page.goto('/app/');
    await expect(page.getByTestId('push-card')).toBeVisible();
    await page.goto('/app/account/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    expect(await page.evaluate(() => window.Notification.permission)).toBe('default');
  });
});

test.describe('Settings → Notifications', () => {
  test('shows the switches, the other devices, and Always', async ({ page }, testInfo) => {
    const problems = recordProblems(page);
    await capableBrowser(page, 'default');
    await mockLedger(page);
    await mockPrefs(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    });
    // This device is not among the prefs' devices: the switch starts off.
    await page.goto('/app/account/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Reminders', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(
      page.getByRole('switch', { name: 'Notifications on this device' }),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('Email is only used when no device has notifications on.'),
    ).toBeVisible();
    await expect(page.getByText('macOS · Safari')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove macOS · Safari' })).toBeVisible();
    await expect(page.getByText('Security emails')).toBeVisible();
    await expect(page.getByText('Always')).toBeVisible();
    await expect(page.getByText(/They can’t be turned off\./)).toBeVisible();
    await expectSoundScreen(page, testInfo);
    expect(problems).toEqual([]);
  });

  test('applies the switches at once and removes devices', async ({ page }) => {
    await capableBrowser(page, 'default');
    await mockLedger(page);
    const patched: unknown[] = [];
    await page.route('**/api/notifications/prefs', (route) => {
      if (route.request().method() === 'PATCH') {
        patched.push(route.request().postDataJSON());
        return route.fulfill({ json: { ...PREFS, reminders: false } });
      }
      return route.fulfill({ json: PREFS });
    });
    const deleted: string[] = [];
    await page.route('**/api/notifications/endpoints/*', (route) => {
      deleted.push(route.request().url());
      return route.fulfill({ status: 204, body: '' });
    });
    await page.goto('/app/account/notifications');
    await page.getByRole('switch', { name: 'Reminders', exact: true }).click();
    await expect.poll(() => patched).toEqual([{ reminders: false }]);

    await page.getByRole('button', { name: 'Remove macOS · Safari' }).click();
    await expect
      .poll(() => deleted)
      .toEqual([
        expect.stringContaining(
          '/api/notifications/endpoints/nep_01K1G4KX00BBBBBBBBBBBBBBBB?by=user',
        ),
      ]);
  });

  test('turns this device on from the switch and off again', async ({ page }) => {
    await capableBrowser(page, 'default');
    await fakeSubscription(page);
    await mockLedger(page);
    await page.route('**/api/notifications/vapid-key', (route) =>
      route.fulfill({ json: { publicKey: 'BEl64zVAPIDpublicKeyForTestsOnly0123456789_-testkey' } }),
    );
    await page.route('**/api/notifications/endpoints', (route) =>
      route.fulfill({ json: { id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' } }),
    );
    let devices: unknown[] = [];
    await page.route('**/api/notifications/prefs', (route) =>
      route.fulfill({
        json: {
          ...PREFS,
          devices: [
            {
              id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA',
              label: 'Linux · Chrome',
              platform: 'desktop',
              lastSeenAt: '2026-09-21T10:00:00.000Z',
            },
            ...devices,
          ],
        },
      }),
    );
    const prompts = recordPromptEvents(page);
    await page.goto('/app/account/notifications');
    await expect
      .poll(() => prompts)
      .toContainEqual({ name: 'push_prompt_shown', entry: 'settings', result: undefined });

    await page.getByRole('switch', { name: 'Notifications on this device' }).click();
    await expect(
      page.getByRole('switch', { name: 'Notifications on this device' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(() => prompts)
      .toContainEqual({ name: 'push_prompt_result', entry: 'settings', result: 'granted' });

    devices = PREFS.devices;
    const deleted: string[] = [];
    await page.route('**/api/notifications/endpoints/*', (route) => {
      deleted.push(route.request().url());
      return route.fulfill({ status: 204, body: '' });
    });
    const toggle = page.getByRole('switch', { name: 'Notifications on this device' });
    await toggle.click();
    await expect
      .poll(() => deleted)
      .toEqual([
        expect.stringContaining(
          '/api/notifications/endpoints/nep_01K1G4KX00AAAAAAAAAAAAAAAA?by=user',
        ),
      ]);
    // The poll above sees the DELETE go out; the stored id is cleared once its answer lands,
    // so wait for the switch to read off before reading storage.
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      await page.evaluate(() => window.localStorage.getItem('netnet.pushEndpointId')),
    ).toBeNull();
  });

  test('leaves the switch off with a pointer when denied, and hides it when incapable', async ({
    page,
  }) => {
    await capableBrowser(page, 'denied');
    await mockLedger(page);
    await mockPrefs(page);
    await page.goto('/app/account/notifications');
    await expect(
      page.getByRole('switch', { name: 'Notifications on this device' }),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('Allow them in your browser or phone settings to turn them on.'),
    ).toBeVisible();

    await incapableBrowser(page);
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Reminders', exact: true })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Email reminders' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Notifications on this device' })).toBeHidden();
    await expect(page.getByText(/Home Screen/)).toBeHidden();
  });
});

test.describe('the lifecycle', () => {
  test('a session starting on a device with push on checks in', async ({ page }) => {
    await capableBrowser(page, 'granted');
    await fakeSubscription(page);
    await mockLedger(page);
    const checkedIn: unknown[] = [];
    await page.route('**/api/notifications/endpoints/*', (route) => {
      const body = route.request().postDataJSON() as unknown;
      checkedIn.push({ method: route.request().method(), body });
      return route.fulfill({ status: 204, body: '' });
    });
    await page.addInitScript(() => {
      window.localStorage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    });
    await page.goto('/app/');
    await expect
      .poll(() => checkedIn)
      .toEqual([
        { method: 'PUT', body: { endpoint: SUBSCRIPTION.endpoint, keys: SUBSCRIPTION.keys } },
      ]);
    expect(await page.evaluate(() => window.localStorage.getItem('netnet.pushEndpointId'))).toBe(
      'nep_01K1G4KX00AAAAAAAAAAAAAAAA',
    );
  });

  test('signing out revokes this device’s subscription', async ({ page }) => {
    await capableBrowser(page, 'granted');
    await fakeSubscription(page);
    await mockLedger(page);
    await mockPrefs(page);
    const deleted: string[] = [];
    await page.route('**/api/notifications/endpoints/*', (route) => {
      const url = new URL(route.request().url());
      deleted.push(`${route.request().method()} ${url.pathname}${url.search}`);
      return route.fulfill({ status: 204, body: '' });
    });
    await page.route('**/api/auth/sign-out', (route) => route.fulfill({ json: {} }));
    // Set once, after the load: an init script would set it again past sign-out.
    await page.goto('/app/account');
    await page.evaluate(() => {
      window.localStorage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    });
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect
      .poll(() => deleted)
      .toContainEqual(
        'DELETE /api/notifications/endpoints/nep_01K1G4KX00AAAAAAAAAAAAAAAA?by=signout',
      );
    await page.waitForURL('**/app/login');
    expect(
      await page.evaluate(() => window.localStorage.getItem('netnet.pushEndpointId')),
    ).toBeNull();
  });

  test('Account links Notifications below General', async ({ page }) => {
    await capableBrowser(page, 'default');
    await mockLedger(page);
    await mockPrefs(page);
    await page.goto('/app/account');
    const general = page.getByRole('link', { name: /General/ });
    const notifications = page.getByRole('link', { name: 'Notifications' });
    await expect(notifications).toBeVisible();
    expect(await general.boundingBox().then((box) => box?.y ?? 0)).toBeLessThan(
      await notifications.boundingBox().then((box) => box?.y ?? 0),
    );
    await notifications.click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });
});
