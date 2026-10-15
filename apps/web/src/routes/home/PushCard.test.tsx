import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PushCard } from './PushCard';

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
    store?: ReturnType<typeof memoryStorage>;
  } = {},
) {
  const store = options.store ?? memoryStorage();
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
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('PushCard', () => {
  it('asks once and gently on a capable browser with an undecided device', () => {
    browser();
    const markup = renderToStaticMarkup(<PushCard />);
    expect(markup).toContain('data-testid="push-card"');
    expect(markup).toContain(
      'Want a gentle nudge on this device if you haven’t looked in a while?',
    );
    expect(markup).toContain('Turn on');
    expect(markup).toContain('Not now');
  });

  it('shows nothing where push cannot work', () => {
    browser({ capable: false });
    expect(renderToStaticMarkup(<PushCard />)).toBe('');
  });

  it('shows nothing once the device has decided', () => {
    // Push on.
    const on = browser();
    on.setItem('netnet.pushEndpointId', 'nep_01K1G4KX00AAAAAAAAAAAAAAAA');
    expect(renderToStaticMarkup(<PushCard />)).toBe('');

    // Permission granted or denied elsewhere.
    browser({ permission: 'granted' });
    expect(renderToStaticMarkup(<PushCard />)).toBe('');
    browser({ permission: 'denied' });
    expect(renderToStaticMarkup(<PushCard />)).toBe('');
  });

  it('shows nothing while Not now hides it', () => {
    const store = browser();
    store.setItem(
      'netnet.pushPrompt',
      JSON.stringify({ dismissals: 1, hiddenUntil: '2999-01-01T00:00:00.000Z' }),
    );
    expect(renderToStaticMarkup(<PushCard />)).toBe('');
    store.setItem('netnet.pushPrompt', JSON.stringify({ dismissals: 2, hiddenUntil: null }));
    expect(renderToStaticMarkup(<PushCard />)).toBe('');
  });
});
