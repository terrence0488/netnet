import { z } from 'zod';

/**
 * The notifications REST contracts (architecture §7.2, PRD J12): the Reminders switches, the VAPID
 * public key, and the push endpoints — one row per device where push is on.
 */

/** The device a push endpoint belongs to: the same three `push_enabled` names. */
export const notificationPlatforms = ['ios', 'android', 'desktop'] as const;
export type NotificationPlatform = (typeof notificationPlatforms)[number];
export const notificationPlatformSchema = z.enum(notificationPlatforms);

/**
 * The push services NetNet sends web push to (architecture §7.10), and the only ones: Google's
 * (Chrome, Android and the Chromium browsers built on it), Mozilla's (Firefox), Microsoft's (Edge
 * on Windows) and Apple's (Safari, and NetNet on an iPhone's Home Screen). An entry is a host, or
 * `*.` and a domain for any host below it. Frozen, and read from no environment: the routes and
 * the channel take a list as a dependency, so tests pass a fake service's host and production
 * passes this one.
 */
export const PUSH_SERVICE_HOSTS: readonly string[] = Object.freeze([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '*.notify.windows.com',
  '*.push.apple.com',
]);

/**
 * What the WHATWG URL parser gives. Every runtime NetNet runs on has it (browsers, Node 22); this
 * package's lib (ES2023) does not type it.
 */
interface ParsedUrl {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly port: string;
}

const WhatwgUrl = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;

/** `value` parsed as an absolute URL, or null when it is not one. */
function parseUrl(value: string): ParsedUrl | null {
  try {
    return new WhatwgUrl(value);
  } catch {
    return null;
  }
}

/** An https: URL with a host and no whitespace: the shape every push service's endpoint has. */
function isHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  const url = parseUrl(value);
  return url !== null && url.protocol === 'https:' && url.hostname !== '';
}

/** The parser writes every IPv4 form as four decimals, and IPv6 in brackets. */
function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/** `host` is `entry`, or for `*.domain` any host below `domain`, at a dot boundary. */
function hostMatches(host: string, entry: string): boolean {
  if (!entry.startsWith('*.')) return host === entry;
  const suffix = entry.slice(1);
  return host.length > suffix.length && host.endsWith(suffix);
}

/**
 * Whether `value` is an endpoint at one of `hosts` (architecture §7.10): https, the default port,
 * no userinfo, a host name (never an IP literal) on the list. The host compared is the one `fetch`
 * will call, since both read the URL with the same parser.
 */
export function isPushServiceUrl(
  value: string,
  hosts: readonly string[] = PUSH_SERVICE_HOSTS,
): boolean {
  if (!isHttpsUrl(value)) return false;
  const url = parseUrl(value);
  if (url === null || url.port !== '' || url.username !== '' || url.password !== '') return false;
  if (isIpLiteral(url.hostname)) return false;
  return hosts.some((entry) => hostMatches(url.hostname, entry.toLowerCase()));
}

/** What the person is told when their browser's push service is not on the list. */
const NOT_A_PUSH_SERVICE =
  "This browser's push service is not one NetNet sends to; reminders will come by email instead.";

/** A push service URL at one of `hosts`: what the browser subscribed with, and nowhere else. */
export function pushEndpointUrlSchemaFor(hosts: readonly string[]) {
  return z
    .string({ error: 'Give the push service URL as a string.' })
    .min(1, 'Give the push service URL the browser subscribed with.')
    .max(2048, 'Give a push service URL of at most 2048 characters.')
    .refine(isHttpsUrl, {
      message: 'Give the https: URL the browser subscribed with.',
      abort: true,
    })
    .refine((value) => isPushServiceUrl(value, hosts), NOT_A_PUSH_SERVICE);
}

/** A push service URL at one of the push services NetNet sends to. */
export const pushEndpointUrlSchema = pushEndpointUrlSchemaFor(PUSH_SERVICE_HOSTS);

/** One of the subscription's keys (`p256dh`, `auth`): base64url from the browser. */
const subscriptionKeySchema = (name: string) =>
  z
    .string({ error: `Give the subscription's ${name} key as a string.` })
    .min(1, `Give the subscription's ${name} key.`)
    .max(512, `Give a ${name} key of at most 512 characters.`)
    .refine(
      (value) => /^[A-Za-z0-9_-]+$/.test(value),
      `Give the ${name} key as the browser gave it (letters, digits, - and _).`,
    );

export const pushKeysSchema = z.strictObject({
  p256dh: subscriptionKeySchema('p256dh'),
  auth: subscriptionKeySchema('auth'),
});
export type PushKeys = z.infer<typeof pushKeysSchema>;

/** "Android · Chrome": the device as the person recognises it in the device list. */
export const deviceLabelSchema = z
  .string({ error: 'Give the device label as a string, such as "Android · Chrome".' })
  .min(1, 'Give the device label, such as "Android · Chrome".')
  .max(64, 'Give a device label of at most 64 characters.');

/**
 * The two subscription bodies over a list of push services: production's routes use
 * `PUSH_SERVICE_HOSTS`, and tests a fake service's host.
 */
export function notificationEndpointSchemasFor(hosts: readonly string[]) {
  const endpoint = pushEndpointUrlSchemaFor(hosts);
  return {
    /** `POST /api/notifications/endpoints`: the subscription a tap turned on. */
    create: z.strictObject({
      endpoint,
      keys: pushKeysSchema,
      platform: notificationPlatformSchema,
      deviceLabel: deviceLabelSchema,
    }),
    /** `PUT /api/notifications/endpoints/:id`: a session's check-in, its subscription rotated. */
    update: z.strictObject({ endpoint, keys: pushKeysSchema }),
  };
}

const endpointSchemas = notificationEndpointSchemasFor(PUSH_SERVICE_HOSTS);

/** `POST /api/notifications/endpoints`: the subscription a tap turned on. */
export const notificationEndpointCreateSchema = endpointSchemas.create;
export type NotificationEndpointCreate = z.infer<typeof notificationEndpointCreateSchema>;

/** `PUT /api/notifications/endpoints/:id`: a session's check-in, with a rotated subscription. */
export const notificationEndpointUpdateSchema = endpointSchemas.update;
export type NotificationEndpointUpdate = z.infer<typeof notificationEndpointUpdateSchema>;

/** `DELETE …/endpoints/:id`: the switch or Remove (`user`), or signing out (`signout`). */
export const endpointRevokeBySchema = z.enum(['user', 'signout']);
export type EndpointRevokeBy = z.infer<typeof endpointRevokeBySchema>;

/** `GET /api/notifications/vapid-key`: the public key the browser subscribes with. */
export const vapidKeySchema = z.strictObject({ publicKey: z.string().min(1) });
export type VapidKey = z.infer<typeof vapidKeySchema>;

/** One device in `GET /api/notifications/prefs`: active ones only. */
export const notificationDeviceSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  platform: notificationPlatformSchema,
  /** "Last used": an ISO instant. */
  lastSeenAt: z.string().min(1),
});
export type NotificationDevice = z.infer<typeof notificationDeviceSchema>;

/** `GET /api/notifications/prefs`: the switches and the devices with push on. */
export const notificationPrefsSchema = z.strictObject({
  /** Reminders off means no reminder by any channel, until turned back on. */
  reminders: z.boolean(),
  /** Email reminders off means no reminder email, ever. */
  email: z.boolean(),
  /** A reminder email goes to a verified address only. */
  emailVerified: z.boolean(),
  devices: z.array(notificationDeviceSchema),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

/** `PATCH /api/notifications/prefs`: either switch, or both; applies at once. */
export const notificationPrefsPatchSchema = z
  .strictObject({
    reminders: z.boolean().exactOptional(),
    email: z.boolean().exactOptional(),
  })
  .refine((patch) => patch.reminders !== undefined || patch.email !== undefined, {
    message: 'Send reminders, email, or both.',
    path: ['body'],
  });
export type NotificationPrefsPatch = z.infer<typeof notificationPrefsPatchSchema>;
