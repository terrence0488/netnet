import type { ClientEventName, EventProps } from '@netnet/contracts';
import { api } from './client';

/**
 * The web app's analytics (architecture §7.7): client events go to `POST /api/events`, which
 * accepts only the names marked *client*, typed by their schemas in packages/contracts. The server
 * attaches the user, segment and version.
 */

/**
 * Sends one client event. It never rejects: an event that fails to send is dropped, because
 * analytics never gets in the way of what the person is doing.
 */
export async function trackClient<N extends ClientEventName>(
  name: N,
  props: EventProps<N>,
): Promise<void> {
  try {
    await api.post<void>('/events', { name, props });
  } catch {
    // Dropped: a lost event costs a data point, an error would cost the person.
  }
}

/* ---------------------------------------------------------------- sessions */

/** A session ends after this long without activity; the next activity starts a new one. */
export const SESSION_IDLE_MS = 30 * 60_000;

/** Shared by every tab of the app, so a reload or a second tab is not a new session. */
const STORAGE_KEY = 'netnet.lastActivityAt';

/** The stored time is rewritten at most this often; this tab's own clock is always exact. */
const WRITE_EVERY_MS = 5_000;

/** What counts as activity. `visibilitychange` counts only when the app becomes visible. */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'focus',
  'visibilitychange',
] as const;

type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export interface SessionTrackerOptions {
  /** Where activity is heard (default: `window`, in the capture phase). */
  readonly target?: Listenable;
  /** Whether the app is on screen (default: `document.visibilityState`). */
  readonly isVisible?: () => boolean;
  readonly now?: () => number;
  /** Default: `localStorage`; null keeps the time in this tab only. */
  readonly storage?: KeyValueStore | null;
  /** Default: sends `session_started`. */
  readonly onSessionStart?: () => void;
}

function defaultStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Starts tracking sessions: `session_started` fires on the first activity after 30 minutes idle,
 * counting opening the app (this call) as activity. Returns the function that stops it. P1-T14
 * mounts it in the shell: `useEffect(() => startSessionTracker(), [])`.
 */
export function startSessionTracker(options: SessionTrackerOptions = {}): () => void {
  const target = options.target ?? window;
  const isVisible = options.isVisible ?? (() => document.visibilityState === 'visible');
  const now = options.now ?? Date.now;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const onSessionStart = options.onSessionStart ?? (() => void trackClient('session_started', {}));

  let lastHere: number | null = null;
  let lastWritten: number | null = null;

  function stored(): number | null {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      const at = raw == null ? NaN : Number(raw);
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  }

  function write(at: number): void {
    lastWritten = at;
    try {
      storage?.setItem(STORAGE_KEY, String(at));
    } catch {
      // Storage is unavailable (a private window, say): this tab keeps its own time.
    }
  }

  function activity(): void {
    const at = now();
    const elsewhere = stored();
    const last =
      lastHere === null ? elsewhere : elsewhere === null ? lastHere : Math.max(lastHere, elsewhere);
    lastHere = at;
    if (lastWritten === null || at - lastWritten >= WRITE_EVERY_MS || at < lastWritten) write(at);
    if (last === null || at - last >= SESSION_IDLE_MS) onSessionStart();
  }

  const listener = (event: Event) => {
    if (event.type === 'visibilitychange' && !isVisible()) return;
    activity();
  };
  for (const type of ACTIVITY_EVENTS) {
    target.addEventListener(type, listener, { capture: true, passive: true });
  }
  activity();
  return () => {
    for (const type of ACTIVITY_EVENTS) {
      target.removeEventListener(type, listener, { capture: true });
    }
  };
}
