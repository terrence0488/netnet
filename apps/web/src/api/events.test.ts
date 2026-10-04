import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_IDLE_MS, startSessionTracker, trackClient } from './events';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('trackClient()', () => {
  it('posts the event to /api/events', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await trackClient('insights_viewed', { view: 'quarterly' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/events');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(init?.body as string)).toStrictEqual({
      name: 'insights_viewed',
      props: { view: 'quarterly' },
    });
  });

  it('never rejects: a refused or unsent event is dropped', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Wait.' } }), {
        status: 429,
      }),
    );
    await expect(trackClient('session_started', {})).resolves.toBeUndefined();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(trackClient('signup_started', { method: 'email' })).resolves.toBeUndefined();
  });
});

/** localStorage as a Map, shared by "tabs" built over it. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe('the session tracker', () => {
  const MINUTE = 60_000;
  let now: number;
  let visible: boolean;
  let starts: number;
  let storage: ReturnType<typeof memoryStorage>;
  let stops: (() => void)[];

  beforeEach(() => {
    now = Date.UTC(2026, 7, 1, 10);
    visible = true;
    starts = 0;
    storage = memoryStorage();
    stops = [];
  });

  afterEach(() => stops.forEach((stop) => stop()));

  /** One tab of the app: its window, mounted with the fake clock. */
  function tab(options: { storage?: ReturnType<typeof memoryStorage> | null } = {}) {
    const target = new EventTarget();
    stops.push(
      startSessionTracker({
        target,
        isVisible: () => visible,
        now: () => now,
        storage: options.storage === undefined ? storage : options.storage,
        onSessionStart: () => {
          starts += 1;
        },
      }),
    );
    return (type = 'pointerdown') => target.dispatchEvent(new Event(type));
  }

  it('starts a session when the app opens', () => {
    tab();
    expect(starts).toBe(1);
  });

  it('starts the next one on the first activity after 30 minutes idle, and not before', () => {
    const act = tab();
    now += SESSION_IDLE_MS - 1;
    act('keydown');
    expect(starts).toBe(1);
    now += SESSION_IDLE_MS - 1;
    act('wheel');
    expect(starts).toBe(1);
    now += SESSION_IDLE_MS;
    act('touchstart');
    expect(starts).toBe(2);
    now += 1;
    act();
    expect(starts).toBe(2);
  });

  it('measures idle from the last activity, however frequent it was', () => {
    const act = tab();
    for (let i = 0; i < 10; i += 1) {
      now += 1_000;
      act();
    }
    now += SESSION_IDLE_MS - 1;
    act();
    expect(starts).toBe(1);
  });

  it('counts coming back to the app, and not leaving it', () => {
    const act = tab();
    now += 45 * MINUTE;
    visible = false;
    act('visibilitychange');
    expect(starts).toBe(1);
    now += MINUTE;
    visible = true;
    act('visibilitychange');
    expect(starts).toBe(2);
  });

  it('is one session across a reload or a second tab within 30 minutes', () => {
    const first = tab();
    now += 20 * MINUTE;
    first();
    now += 20 * MINUTE;
    tab();
    expect(starts).toBe(1);
    now += SESSION_IDLE_MS;
    tab();
    expect(starts).toBe(2);
  });

  it("lets another tab's activity keep this one's session going", () => {
    const quiet = tab();
    const busy = tab();
    expect(starts).toBe(1);
    for (let i = 0; i < 3; i += 1) {
      now += 20 * MINUTE;
      busy();
    }
    now += MINUTE;
    quiet();
    expect(starts).toBe(1);
  });

  it('works in this tab alone when storage is unavailable', () => {
    const act = tab({ storage: null });
    now += SESSION_IDLE_MS - 1;
    act();
    expect(starts).toBe(1);
    now += SESSION_IDLE_MS;
    act();
    expect(starts).toBe(2);
    const throwing = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(() => tab({ storage: throwing })).not.toThrow();
    expect(starts).toBe(3);
  });

  it('hears nothing once stopped', () => {
    const act = tab();
    stops.pop()?.();
    now += SESSION_IDLE_MS;
    act();
    expect(starts).toBe(1);
  });

  it('sends session_started by default', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    stops.push(startSessionTracker({ target: new EventTarget(), now: () => now, storage }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toStrictEqual({
      name: 'session_started',
      props: {},
    });
  });
});
