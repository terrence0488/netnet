import type { NotificationPlatform, NotificationPrefs, VapidKey } from '@netnet/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, isApiError, send } from './client';

/**
 * Web push on this device (PRD J12, architecture §7.10): whether the browser can receive it, the
 * subscription behind the Home card's Turn on and the Settings switch, the session check-in, and
 * what sign-out leaves behind. Permission is requested only inside the tap that turns push on —
 * `turnPushOn` is the one function that subscribes — never on load, never during sign-up or the
 * basics.
 */

/* ------------------------------------------------------------ capability */

/**
 * Whether the browser can receive push: a service worker, `PushManager` and `Notification`. Where
 * one is missing — including an iPhone or iPad in a Safari tab — no push option appears anywhere
 * and reminders go by email. Truthiness, not presence, so tests can take one away.
 */
export function supportsPush(): boolean {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return Boolean(navigator.serviceWorker && window.PushManager && window.Notification);
  } catch {
    return false;
  }
}

export type PushPermission = 'default' | 'granted' | 'denied';

/** The browser's permission, or `denied` where push cannot work: decided either way. */
export function pushPermission(): PushPermission {
  try {
    if (!supportsPush()) return 'denied';
    return window.Notification.permission;
  } catch {
    return 'denied';
  }
}

/* ------------------------------------------------------------ storage */

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function deviceStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** This device's endpoint id, once its subscription is saved. */
const ENDPOINT_KEY = 'netnet.pushEndpointId';

export function storedEndpointId(store: KeyValueStore | null = deviceStorage()): string | null {
  try {
    const id = store?.getItem(ENDPOINT_KEY);
    return id === undefined || id === null || id === '' ? null : id;
  } catch {
    return null;
  }
}

function setStoredEndpointId(id: string, store: KeyValueStore | null = deviceStorage()): void {
  try {
    store?.setItem(ENDPOINT_KEY, id);
  } catch {
    // A private window, say: the switch still works for this page load.
  }
}

export function clearStoredEndpointId(store: KeyValueStore | null = deviceStorage()): void {
  try {
    store?.removeItem(ENDPOINT_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/* ------------------------------------------------------------ the Home card's state */

/** How the Home card's Not nows stay on the device: how many, and until when it hides. */
const PROMPT_KEY = 'netnet.pushPrompt';
const PROMPT_HIDE_DAYS = 30;

interface PromptState {
  dismissals: number;
  /** An ISO instant, or null when the card hides for good. */
  hiddenUntil: string | null;
}

function readPrompt(store: KeyValueStore | null): PromptState {
  try {
    const raw = store?.getItem(PROMPT_KEY);
    if (raw === undefined || raw === null) return { dismissals: 0, hiddenUntil: null };
    const parsed = JSON.parse(raw) as Partial<PromptState>;
    if (typeof parsed.dismissals !== 'number' || parsed.dismissals < 0) {
      return { dismissals: 0, hiddenUntil: null };
    }
    return {
      dismissals: Math.floor(parsed.dismissals),
      hiddenUntil: typeof parsed.hiddenUntil === 'string' ? parsed.hiddenUntil : null,
    };
  } catch {
    return { dismissals: 0, hiddenUntil: null };
  }
}

/** Whether Not now hides the Home card now: the first hides 30 days, the second for good. */
export function promptHidden(
  now: Date = new Date(),
  store: KeyValueStore | null = deviceStorage(),
): boolean {
  const state = readPrompt(store);
  if (state.dismissals <= 0) return false;
  if (state.dismissals >= 2) return true;
  if (state.hiddenUntil === null) return false;
  return new Date(state.hiddenUntil).getTime() > now.getTime();
}

/** A Not now: the first hides the card for 30 days, the second for good. */
export function recordNotNow(
  now: Date = new Date(),
  store: KeyValueStore | null = deviceStorage(),
): void {
  const state = readPrompt(store);
  const dismissals = state.dismissals + 1;
  const next: PromptState =
    dismissals >= 2
      ? { dismissals, hiddenUntil: null }
      : {
          dismissals,
          hiddenUntil: new Date(now.getTime() + PROMPT_HIDE_DAYS * 24 * 60 * 60_000).toISOString(),
        };
  try {
    store?.setItem(PROMPT_KEY, JSON.stringify(next));
  } catch {
    // The card shows again next time; a lost dismissal costs nothing.
  }
}

/**
 * Whether this device has not decided about push: a capable browser, nothing saved, and the
 * browser's permission still at its default. The Home card and the settings prompt show only then.
 */
export function isPushUndecided(store: KeyValueStore | null = deviceStorage()): boolean {
  return supportsPush() && storedEndpointId(store) === null && pushPermission() === 'default';
}

/* ------------------------------------------------------------ the device as the list sees it */

function userAgent(): string {
  try {
    return navigator.userAgent ?? '';
  } catch {
    return '';
  }
}

function touchPoints(): number {
  try {
    return navigator.maxTouchPoints ?? 0;
  } catch {
    return 0;
  }
}

/** `ios`, `android` or `desktop`: what `push_enabled` names. */
export function platformOf(
  ua: string = userAgent(),
  touches: number = touchPoints(),
): NotificationPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // An iPad asking for the desktop site calls itself a Macintosh, with fingers.
  if (/Macintosh/i.test(ua) && touches > 2) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function osOf(ua: string, platform: NotificationPlatform): string {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Desktop';
}

function browserOf(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Browser';
}

/** "Android · Chrome": the device as the person recognises it in the device list. */
export function deviceLabelOf(ua: string = userAgent(), touches: number = touchPoints()): string {
  return `${osOf(ua, platformOf(ua, touches))} · ${browserOf(ua)}`;
}

/* ------------------------------------------------------------ subscribing */

/** The VAPID public key the browser subscribes with. */
export function vapidPublicKey(): Promise<string> {
  return api.get<VapidKey>('/notifications/vapid-key').then((key) => key.publicKey);
}

/** The service worker push arrives through, at the web app's scope. */
export const SERVICE_WORKER_URL = '/app/sw.js';

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function localSubscription(): Promise<PushSubscription | null> {
  if (!supportsPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Forgets the local subscription, if there is one. Best effort either way. */
async function unsubscribeLocal(): Promise<void> {
  try {
    await (await localSubscription())?.unsubscribe();
  } catch {
    // The subscription is gone or never was; the server row is what matters.
  }
}

export type TurnOnResult =
  /** Push is on for this device. */
  | 'on'
  /** The browser's permission is denied: the switch stays off with its pointer. */
  | 'denied'
  /** Anything else: the network, the server, or a subscription the browser refused. */
  | 'error';

/**
 * Turns push on for this device, from the tap that asks for it: registers the worker, subscribes
 * — the browser's own prompt follows this tap — and saves the subscription. The prompt is the
 * browser's; when it is denied there is nothing more to ask. A subscription the server refuses is
 * unsubscribed again, so no orphan is left behind.
 */
export async function turnPushOn(): Promise<TurnOnResult> {
  const denied = () => (pushPermission() === 'denied' ? 'denied' : 'error');
  try {
    const publicKey = await vapidPublicKey();
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    let subscription: PushSubscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch {
      return denied();
    }
    const json = subscription.toJSON();
    if (
      typeof json.endpoint !== 'string' ||
      typeof json.keys?.p256dh !== 'string' ||
      typeof json.keys?.auth !== 'string'
    ) {
      await subscription.unsubscribe().catch(() => undefined);
      return 'error';
    }
    try {
      const { id } = await api.post<{ id: string }>('/notifications/endpoints', {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        platform: platformOf(),
        deviceLabel: deviceLabelOf(),
      });
      setStoredEndpointId(id);
      return 'on';
    } catch {
      await subscription.unsubscribe().catch(() => undefined);
      return denied();
    }
  } catch {
    return 'error';
  }
}

/**
 * Turns push off for this device: unsubscribes, then revokes the row — `?by=user` from the switch
 * or Remove, `?by=signout` on sign-out. A row already gone reads as off.
 */
export async function turnPushOff(by: 'user' | 'signout'): Promise<void> {
  const id = storedEndpointId();
  await unsubscribeLocal();
  if (id === null) return;
  try {
    await send('DELETE', `/notifications/endpoints/${id}?by=${by}`);
    clearStoredEndpointId();
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) {
      clearStoredEndpointId();
      return;
    }
    throw error;
  }
}

/**
 * What sign-out leaves behind: this device's push subscription revoked on the server
 * (`DELETE /api/notifications/endpoints/:id?by=signout`), so the comeback reminder never follows
 * the person after they leave. Best-effort: signing out continues whatever happens here.
 */
export function revokePushOnSignOut(): Promise<void> {
  return turnPushOff('signout').catch(() => undefined);
}

/* ------------------------------------------------------------ the session check-in */

/**
 * A session starting on a device with push on checks in (`PUT …/endpoints/:id`): the row's
 * `last_seen_at` moves, and a rotated subscription follows. When the device was removed, the app
 * unsubscribes locally and shows the switch off. Best effort: anything else keeps the row for the
 * next session.
 */
export async function syncPushOnSessionStart(): Promise<void> {
  try {
    const id = storedEndpointId();
    if (id === null) return;
    const subscription = await localSubscription();
    if (subscription === null) {
      clearStoredEndpointId();
      return;
    }
    const json = subscription.toJSON();
    if (
      typeof json.endpoint !== 'string' ||
      typeof json.keys?.p256dh !== 'string' ||
      typeof json.keys?.auth !== 'string'
    ) {
      return;
    }
    try {
      await send('PUT', `/notifications/endpoints/${id}`, {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    } catch (error) {
      if (isApiError(error, 'NOT_FOUND')) {
        await subscription.unsubscribe().catch(() => undefined);
        clearStoredEndpointId();
      }
    }
  } catch {
    // The next session tries again.
  }
}

/** Checks push in once per page load, while someone is signed in. */
export function usePushSessionSync(): void {
  useEffect(() => {
    void syncPushOnSessionStart();
  }, []);
}

/* ------------------------------------------------------------ prefs */

/** The switches and the devices with push on. */
export const NOTIFICATIONS_KEY = ['notifications', 'prefs'] as const;

export const notificationsQuery = queryOptions({
  queryKey: NOTIFICATIONS_KEY,
  queryFn: ({ signal }) => api.get<NotificationPrefs>('/notifications/prefs', { signal }),
});

export function useNotificationsPrefs() {
  return useQuery(notificationsQuery);
}

/** Either switch, applied at once; the answer replaces the cached prefs. */
export function useUpdateNotificationPrefs() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: { reminders?: boolean; email?: boolean }) =>
      api.patch<NotificationPrefs>('/notifications/prefs', patch),
    onSuccess: (prefs) => client.setQueryData(NOTIFICATIONS_KEY, prefs),
  });
}

/** Remove: revokes another device (`?by=user`) and reads the prefs again. */
export function useRemoveDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send('DELETE', `/notifications/endpoints/${id}?by=user`),
    onSuccess: () => void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
