import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredEndpointId,
  deviceLabelOf,
  isPushUndecided,
  platformOf,
  promptHidden,
  pushPermission,
  recordNotNow,
  revokePushOnSignOut,
  storedEndpointId,
  supportsPush,
  syncPushOnSessionStart,
  turnPushOff,
  turnPushOn,
} from './push';

/**
 * Push on this device (PRD J12): capability, the device's label, the Home card's Not-now counts,
 * turning on and off, the session check-in, and what sign-out leaves behind — with the browser's
 * push APIs stubbed. Permission is requested only inside the tap that turns push on: statically,
 * `subscribe(` appears once, in `turnPushOn`, and `requestPermission` nowhere.
 */

const fetchMock = vi.fn<typeof fetch>();

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

type MemoryStorage = ReturnType<typeof memoryStorage>;

let storage: MemoryStorage;

const SUBSCRIPTION_JSON = {
  endpoint: 'https://push.example.net/push/test-device',
  keys: { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' },
};

function fakeSubscription() {
  return {
    ...SUBSCRIPTION_JSON,
    toJSON: () => SUBSCRIPTION_JSON,
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  };
}

interface BrowserStub {
  register: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  getSubscription: ReturnType<typeof vi.fn>;
}

/** A capable browser whose subscription calls the test observes. */
function capableBrowser(
  options: {
    permission?: 'default' | 'granted' | 'denied';
    userAgent?: string;
    touchPoints?: number;
    subscription?: ReturnType<typeof fakeSubscription> | null;
    subscribe?: (options: unknown) => Promise<unknown>;
  } = {},
): BrowserStub {
  const subscription =
    options.subscription === undefined ? fakeSubscription() : options.subscription;
  const subscribe =
    options.subscribe === undefined
      ? vi.fn(() => Promise.resolve(subscription ?? fakeSubscription()))
      : vi.fn(options.subscribe);
  const getSubscription = vi.fn(() => Promise.resolve(subscription));
  const register = vi.fn(() => Promise.resolve({ pushManager: { subscribe, getSubscription } }));
  vi.stubGlobal('window', {
    PushManager: {},
    Notification: { permission: options.permission ?? 'default' },
    localStorage: storage,
  });
  vi.stubGlobal('navigator', {
    userAgent: options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
    maxTouchPoints: options.touchPoints ?? 0,
    serviceWorker: { register, getRegistration: vi.fn(() => register()) },
  });
  return { register, subscribe, getSubscription };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function errorResponse(code: string, status: number): Response {
  return jsonResponse({ error: { code, message: `${code}.` } }, status);
}

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('supportsPush', () => {
  it('needs a service worker, PushManager and Notification', () => {
    capableBrowser();
    expect(supportsPush()).toBe(true);
    expect(pushPermission()).toBe('default');
  });

  it('is false where one is missing, and permission reads as denied', () => {
    for (const missing of ['serviceWorker', 'PushManager', 'Notification'] as const) {
      capableBrowser();
      if (missing === 'serviceWorker') {
        vi.stubGlobal('navigator', { userAgent: 'x', maxTouchPoints: 0 });
      } else {
        const windowStub = { PushManager: {}, Notification: { permission: 'default' } } as Record<
          string,
          unknown
        >;
        delete windowStub[missing];
        vi.stubGlobal('window', { ...windowStub, localStorage: storage });
      }
      expect(supportsPush(), missing).toBe(false);
      expect(pushPermission(), missing).toBe('denied');
    }
  });

  it('is false without a window at all', () => {
    vi.unstubAllGlobals();
    expect(supportsPush()).toBe(false);
  });
});

describe('the device as the list sees it', () => {
  const cases: [string, string, number, string, string][] = [
    [
      'iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
      5,
      'ios',
      'iOS · Safari',
    ],
    [
      'iPad tab',
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari/604.1',
      5,
      'ios',
      'iOS · Safari',
    ],
    [
      'iPad desktop site',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',
      5,
      'ios',
      'iOS · Safari',
    ],
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36',
      5,
      'android',
      'Android · Chrome',
    ],
    [
      'Samsung Internet',
      'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/126.0',
      5,
      'android',
      'Android · Samsung Internet',
    ],
    [
      'Windows Edge',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/126.0 Chrome/126.0 Safari/537.36',
      0,
      'desktop',
      'Windows · Edge',
    ],
    [
      'Windows Firefox',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      0,
      'desktop',
      'Windows · Firefox',
    ],
    [
      'macOS Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1.15',
      0,
      'desktop',
      'macOS · Safari',
    ],
    [
      'Linux Firefox',
      'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
      0,
      'desktop',
      'Linux · Firefox',
    ],
    ['unknown', 'Links/2.0', 0, 'desktop', 'Desktop · Browser'],
  ];
  it.each(cases)('%s is %s', (_name, ua, touches, platform, label) => {
    expect(platformOf(ua, touches)).toBe(platform);
    expect(deviceLabelOf(ua, touches)).toBe(label);
  });
});

describe('the Home card’s Not nows', () => {
  const NOW = new Date('2026-08-01T10:00:00.000Z');
  const DAY = 24 * 60 * 60_000;

  it('shows until the first Not now, hides 30 days, then hides for good', () => {
    expect(promptHidden(NOW, storage)).toBe(false);
    recordNotNow(NOW, storage);
    expect(promptHidden(NOW, storage)).toBe(true);
    expect(promptHidden(new Date(NOW.getTime() + 30 * DAY - 1000), storage)).toBe(true);
    expect(promptHidden(new Date(NOW.getTime() + 30 * DAY + 1000), storage)).toBe(false);
    recordNotNow(new Date(NOW.getTime() + 31 * DAY), storage);
    expect(promptHidden(new Date(NOW.getTime() + 365 * DAY), storage)).toBe(true);
  });

  it('shows when the stored state is corrupt', () => {
    storage.setItem('netnet.pushPrompt', 'not json');
    expect(promptHidden(NOW, storage)).toBe(false);
  });

  it('undecided means capable, nothing saved and permission at default', () => {
    capableBrowser();
    expect(isPushUndecided(storage)).toBe(true);
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    expect(isPushUndecided(storage)).toBe(false);
    storage.removeItem('netnet.pushEndpointId');
    vi.stubGlobal('window', {
      PushManager: {},
      Notification: { permission: 'granted' },
      localStorage: storage,
    });
    expect(isPushUndecided(storage)).toBe(false);
  });
});

describe('turnPushOn', () => {
  const VAPID_KEY = 'BEl64zVAPIDpublicKeyForTestsOnly0123456789_-testkey';

  function vapidThen(posted: { id: string } | 'error'): void {
    fetchMock.mockResolvedValueOnce(jsonResponse({ publicKey: VAPID_KEY }));
    fetchMock.mockResolvedValueOnce(
      posted === 'error' ? errorResponse('INTERNAL', 500) : jsonResponse(posted),
    );
  }

  it('registers, subscribes and saves the subscription from the tap', async () => {
    const browser = capableBrowser();
    vapidThen({ id: 'nep_01K1G4KX00AAAAAAAAAAAAAAAA' });
    await expect(turnPushOn()).resolves.toBe('on');
    expect(browser.register).toHaveBeenCalledWith('/app/sw.js');
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
    const [options] = browser.subscribe.mock.calls[0] as [
      { userVisibleOnly: boolean; applicationServerKey: Uint8Array },
    ];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/notifications/vapid-key');
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/notifications/endpoints');
    expect(JSON.parse(init?.body as string)).toEqual({
      endpoint: SUBSCRIPTION_JSON.endpoint,
      keys: SUBSCRIPTION_JSON.keys,
      platform: 'desktop',
      deviceLabel: 'Windows · Chrome',
    });
    expect(storedEndpointId(storage)).toBe('nep_01K1G4KX00AAAAAAAAAAAAAAAA');
  });

  it('reports denied when the browser’s prompt is refused, saving nothing', async () => {
    capableBrowser({
      permission: 'denied',
      subscribe: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ publicKey: VAPID_KEY }));
    await expect(turnPushOn()).resolves.toBe('denied');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedEndpointId(storage)).toBeNull();
  });

  it('unsubscribes again when the server refuses the subscription', async () => {
    const subscription = fakeSubscription();
    capableBrowser({ subscription });
    vapidThen('error');
    await expect(turnPushOn()).resolves.toBe('error');
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(storedEndpointId(storage)).toBeNull();
  });

  it('reports error without the VAPID key, and never subscribes', async () => {
    const browser = capableBrowser();
    fetchMock.mockResolvedValueOnce(errorResponse('INTERNAL', 500));
    await expect(turnPushOn()).resolves.toBe('error');
    expect(browser.register).not.toHaveBeenCalled();
    expect(browser.subscribe).not.toHaveBeenCalled();
  });
});

describe('turnPushOff', () => {
  it('unsubscribes and revokes the row, then forgets the id', async () => {
    const subscription = fakeSubscription();
    capableBrowser({ subscription });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await turnPushOff('user');
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/notifications/endpoints/nep_01K1G4KX00AAAAAAAAAAAAAAAA?by=user');
    expect(init?.method).toBe('DELETE');
    expect(storedEndpointId(storage)).toBeNull();
  });

  it('reads an already-gone row as off', async () => {
    capableBrowser({ subscription: null });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockResolvedValueOnce(errorResponse('NOT_FOUND', 404));
    await turnPushOff('user');
    expect(storedEndpointId(storage)).toBeNull();
  });

  it('keeps the id when the revoke fails, and does nothing with no id', async () => {
    capableBrowser({ subscription: null });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(turnPushOff('user')).rejects.toThrow();
    expect(storedEndpointId(storage)).toBe('nep_01K1G4KX00AAAAAAAAAAAAAAAA');

    clearStoredEndpointId(storage);
    await turnPushOff('user');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('revokePushOnSignOut', () => {
  it('revokes with ?by=signout and never throws', async () => {
    capableBrowser({ subscription: null });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(revokePushOnSignOut()).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/notifications/endpoints/nep_01K1G4KX00AAAAAAAAAAAAAAAA?by=signout');
  });
});

describe('syncPushOnSessionStart', () => {
  it('checks in with the current subscription', async () => {
    capableBrowser();
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await syncPushOnSessionStart();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/notifications/endpoints/nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({
      endpoint: SUBSCRIPTION_JSON.endpoint,
      keys: SUBSCRIPTION_JSON.keys,
    });
    expect(storedEndpointId(storage)).toBe('nep_01K1G4KX00AAAAAAAAAAAAAAAA');
  });

  it('unsubscribes locally when the device was removed', async () => {
    const subscription = fakeSubscription();
    capableBrowser({ subscription });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockResolvedValueOnce(errorResponse('NOT_FOUND', 404));
    await syncPushOnSessionStart();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(storedEndpointId(storage)).toBeNull();
  });

  it('forgets an id with no local subscription, and keeps one the network hid', async () => {
    capableBrowser({ subscription: null });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    await syncPushOnSessionStart();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storedEndpointId(storage)).toBeNull();

    const subscription = fakeSubscription();
    capableBrowser({ subscription });
    storage.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await syncPushOnSessionStart();
    expect(storedEndpointId(storage)).toBe('nep_01K1G4KX00AAAAAAAAAAAAAAAA');
  });

  it('does nothing with no id', async () => {
    capableBrowser();
    await syncPushOnSessionStart();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('tap-only permission', () => {
  it('subscribes only in turnPushOn, and never asks on its own', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'push.ts'), 'utf8');
    expect(source.match(/\.subscribe\(/g)).toHaveLength(1);
    expect(source).not.toContain('requestPermission');
  });
});
