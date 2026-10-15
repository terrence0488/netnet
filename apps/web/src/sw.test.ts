import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * The service worker (architecture §5.2, §7.10, CONVENTIONS §9): it handles `push` and
 * `notificationclick` only — no `fetch` handler, caches nothing — shows NetNet's payload, shows
 * nothing for anything else, and a tap focuses or opens the reminder's link inside the web app.
 * The file runs as it is served, in a fake worker scope.
 */

const SCOPE = 'https://netnet.example/app/';
const PAYLOAD = {
  web_push: 8030,
  notification: {
    title: 'NetNet',
    body: 'Your net worth is due for an update.',
    navigate: 'https://netnet.example/app/?r=r1.test-payload.test-signature',
  },
};

interface FakeScope {
  listeners: Record<string, (event: unknown) => void>;
  shown: { title: string; options: Record<string, unknown> }[];
  opened: string[];
  focused: string[];
  clients: { url: string }[];
}

function workerScope(clients: { url: string }[] = []): { self: unknown; fake: FakeScope } {
  const fake: FakeScope = { listeners: {}, shown: [], opened: [], focused: [], clients };
  const waitUntil = (task: Promise<unknown>) =>
    void task.then(
      () => undefined,
      () => undefined,
    );
  const self = {
    location: { origin: 'https://netnet.example' },
    registration: {
      scope: SCOPE,
      showNotification: vi.fn((title: string, options: Record<string, unknown>) => {
        fake.shown.push({ title, options });
        return Promise.resolve();
      }),
    },
    clients: {
      matchAll: vi.fn(() =>
        Promise.resolve(
          fake.clients.map((client) => ({
            url: client.url,
            focus: () => {
              fake.focused.push(client.url);
              return Promise.resolve(client);
            },
          })),
        ),
      ),
      openWindow: vi.fn((url: string) => {
        fake.opened.push(url);
        return Promise.resolve(null);
      }),
    },
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      fake.listeners[type] = listener;
    }),
  };
  runInNewContext(readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8'), {
    self,
    URL,
  });
  void waitUntil;
  return { self, fake };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function pushEvent(data: unknown): unknown {
  return {
    data:
      data === null
        ? null
        : {
            json: (): unknown => {
              if (typeof data === 'string') return JSON.parse(data) as unknown;
              return data;
            },
          },
    waitUntil: (task: Promise<unknown>) =>
      void task.then(
        () => undefined,
        () => undefined,
      ),
  };
}

function clickEvent(navigate: unknown): unknown {
  return {
    notification: { close: vi.fn(), data: { navigate } },
    waitUntil: (task: Promise<unknown>) =>
      void task.then(
        () => undefined,
        () => undefined,
      ),
  };
}

describe('the worker’s shape', () => {
  it('handles push and notificationclick only, and caches nothing', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../public/sw.js'), 'utf8');
    expect(source).toContain("addEventListener('push'");
    expect(source).toContain("addEventListener('notificationclick'");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('fetch');
    expect(code).not.toContain('caches');
    expect(code).not.toContain('Cache');
    const { fake } = workerScope();
    expect(Object.keys(fake.listeners).sort()).toEqual(['notificationclick', 'push']);
  });
});

describe('push', () => {
  it('shows the reminder’s title, body and tap target', async () => {
    const { fake } = workerScope();
    fake.listeners['push']?.(pushEvent(PAYLOAD));
    await settle();
    expect(fake.shown).toEqual([
      {
        title: 'NetNet',
        options: {
          body: 'Your net worth is due for an update.',
          data: { navigate: 'https://netnet.example/app/?r=r1.test-payload.test-signature' },
          icon: 'icons/icon-192.png',
        },
      },
    ]);
  });

  it('shows nothing without data, without the marker, or malformed — a hidden push', async () => {
    const { fake } = workerScope();
    const push = fake.listeners['push'];
    push?.(pushEvent(null));
    push?.(pushEvent({ hello: 'world' }));
    push?.(pushEvent({ web_push: 8030 }));
    push?.(pushEvent({ web_push: 8030, notification: { title: 'NetNet' } }));
    push?.(pushEvent('not json{{'));
    await settle();
    expect(fake.shown).toEqual([]);
  });
});

describe('notificationclick', () => {
  it('focuses the reminder where it is open, else opens it in the web app’s scope', async () => {
    const open = workerScope([
      { url: 'https://netnet.example/app/?r=r1.test-payload.test-signature' },
    ]);
    open.fake.listeners['notificationclick']?.(
      clickEvent('https://netnet.example/app/?r=r1.test-payload.test-signature'),
    );
    await settle();
    expect(open.fake.focused).toEqual([
      'https://netnet.example/app/?r=r1.test-payload.test-signature',
    ]);
    expect(open.fake.opened).toEqual([]);

    const closed = workerScope([{ url: 'https://netnet.example/app/holdings/x' }]);
    closed.fake.listeners['notificationclick']?.(
      clickEvent('https://netnet.example/app/?r=r1.test-payload.test-signature'),
    );
    await settle();
    expect(closed.fake.focused).toEqual([]);
    // Inside /app/, so a Home Screen app opens itself rather than Safari.
    expect(closed.fake.opened).toEqual([
      'https://netnet.example/app/?r=r1.test-payload.test-signature',
    ]);
  });

  it('opens the web app when the tap target leaves our origin or is missing', async () => {
    const { fake } = workerScope();
    const click = fake.listeners['notificationclick'];
    click?.(clickEvent('https://evil.example/app/?r=r1.test-payload.test-signature'));
    click?.(clickEvent(undefined));
    await settle();
    expect(fake.opened).toEqual([SCOPE, SCOPE]);
  });
});
