import { z } from 'zod';

/**
 * The notifications REST contracts (architecture §7.2, PRD J12): the Reminders switches, the VAPID
 * public key, and the push endpoints — one row per device where push is on.
 */

/** The device a push endpoint belongs to: the same three `push_enabled` names. */
export const notificationPlatforms = ['ios', 'android', 'desktop'] as const;
export type NotificationPlatform = (typeof notificationPlatforms)[number];
export const notificationPlatformSchema = z.enum(notificationPlatforms);

/** A push service URL. Push services are HTTPS; anything else is not one. */
export const pushEndpointUrlSchema = z
  .string({ error: 'Give the push service URL as a string.' })
  .min(1, 'Give the push service URL the browser subscribed with.')
  .max(2048, 'Give a push service URL of at most 2048 characters.')
  .refine(
    (value) =>
      value.startsWith('https://') && !/\s/.test(value) && value.length > 'https://'.length + 1,
    'Give the https: URL the browser subscribed with.',
  );

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

/** `POST /api/notifications/endpoints`: the subscription a tap turned on. */
export const notificationEndpointCreateSchema = z.strictObject({
  endpoint: pushEndpointUrlSchema,
  keys: pushKeysSchema,
  platform: notificationPlatformSchema,
  deviceLabel: deviceLabelSchema,
});
export type NotificationEndpointCreate = z.infer<typeof notificationEndpointCreateSchema>;

/** `PUT /api/notifications/endpoints/:id`: a session's check-in, with a rotated subscription. */
export const notificationEndpointUpdateSchema = z.strictObject({
  endpoint: pushEndpointUrlSchema,
  keys: pushKeysSchema,
});
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
