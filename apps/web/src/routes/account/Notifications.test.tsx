import type { NotificationPrefs, ProfileView } from '@netnet/contracts';
import { QueryClient } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { ME_KEY } from '../../api/account';
import { NOTIFICATIONS_KEY } from '../../api/push';
import { BASENAME, routes } from '../../app/routes';

const PERSON: ProfileView = {
  email: 'avery@example.com',
  emailVerified: true,
  country: 'SG',
  baseCurrency: 'SGD',
  segment: 'accumulating',
  timeZone: 'UTC',
  onboardingState: 'done',
};

const PREFS: NotificationPrefs = {
  reminders: true,
  email: true,
  emailVerified: true,
  devices: [
    {
      id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA',
      label: 'Android · Chrome',
      platform: 'android',
      lastSeenAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'nep_01K1G4KX00BBBBBBBBBBBBBBBB',
      label: 'macOS · Safari',
      platform: 'desktop',
      lastSeenAt: '2026-07-20T10:00:00.000Z',
    },
  ],
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function browser(
  options: {
    capable?: boolean;
    permission?: 'default' | 'granted' | 'denied';
    endpointId?: string | null;
  } = {},
) {
  const store = memoryStorage();
  if (options.endpointId !== undefined && options.endpointId !== null) {
    store.setItem('netnet.pushEndpointId', options.endpointId);
  }
  vi.stubGlobal(
    'window',
    options.capable === false
      ? { localStorage: store }
      : {
          PushManager: {},
          Notification: { permission: options.permission ?? 'default' },
          localStorage: store,
        },
  );
  vi.stubGlobal(
    'navigator',
    options.capable === false
      ? { userAgent: 'x' }
      : { userAgent: 'x', maxTouchPoints: 0, serviceWorker: {} },
  );
}

/** Renders Notifications with the person and prefs already known. */
function render(prefs: NotificationPrefs = PREFS): string {
  const client = new QueryClient();
  client.setQueryData(ME_KEY, PERSON);
  client.setQueryData(NOTIFICATIONS_KEY, prefs);
  const router = createMemoryRouter(routes, {
    basename: BASENAME,
    initialEntries: ['/app/account/notifications'],
  });
  return renderToStaticMarkup(<App client={client} router={router} />);
}

afterEach(() => vi.unstubAllGlobals());

describe('Notifications', () => {
  it('shows the switches, the other devices with Remove, and Always', () => {
    browser({ endpointId: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' });
    const markup = render();
    expect(markup).toContain('>Notifications</h1>');
    expect(markup).toContain('Reminders');
    expect(markup).toContain('Off means no reminder by any channel.');
    expect(markup).toContain('Notifications on this device');
    expect(markup).toContain('Email reminders');
    expect(markup).toContain('Email is only used when no device has notifications on.');
    expect(markup).toContain('Other devices');
    expect(markup).toContain('macOS · Safari');
    expect(markup).toContain('Remove macOS · Safari');
    expect(markup).not.toContain('Remove Android · Chrome');
    expect(markup).toContain('Security emails');
    expect(markup).toContain('Always');
    expect(markup).toContain('They can’t be turned off.');
  });

  it('marks this device’s switch by the stored endpoint id', () => {
    browser({ endpointId: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' });
    const on = render();
    expect(on).toContain('aria-label="Notifications on this device"');
    expect(on).toMatch(
      /aria-label="Notifications on this device"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Notifications on this device"/,
    );

    browser({ endpointId: null });
    const off = render();
    expect(off).toMatch(
      /aria-label="Notifications on this device"[^>]*aria-checked="false"|aria-checked="false"[^>]*aria-label="Notifications on this device"/,
    );
  });

  it('hides this device’s switch where push cannot work', () => {
    browser({ capable: false });
    const markup = render();
    expect(markup).toContain('Reminders');
    expect(markup).toContain('Email reminders');
    expect(markup).not.toContain('Notifications on this device');
    expect(markup).toContain('Other devices');
  });

  it('leaves the switch off with a pointer when permission is denied', () => {
    browser({ permission: 'denied' });
    const markup = render();
    expect(markup).toContain('Notifications on this device');
    expect(markup).toContain('Allow them in your browser or phone settings to turn them on.');
  });

  it('hides Other devices when there are none, and leads back to Account', () => {
    browser({ endpointId: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' });
    const markup = render({
      ...PREFS,
      devices: [PREFS.devices[0]!],
    });
    expect(markup).not.toContain('Other devices');
    expect(markup).toContain('href="/app/account"');
    expect(markup).toContain('Back to Account');
  });
});
