import { describe, expect, it } from 'vitest';
import {
  PUSH_SERVICE_HOSTS,
  isPushServiceUrl,
  notificationEndpointCreateSchema,
  notificationEndpointSchemasFor,
  notificationEndpointUpdateSchema,
  notificationPrefsPatchSchema,
  pushEndpointUrlSchema,
  pushEndpointUrlSchemaFor,
} from './notifications';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' },
};

/** The refusal for a host off the list: plain language, with what happens next. */
const NOT_A_PUSH_SERVICE =
  "This browser's push service is not one NetNet sends to; reminders will come by email instead.";

/** The first message the endpoint schema gives `value`, or null when it accepts it. */
function refusal(value: unknown, schema = pushEndpointUrlSchema): string | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? null : (parsed.error.issues.at(-1)?.message ?? '');
}

describe('PUSH_SERVICE_HOSTS', () => {
  it('names the four push services, and cannot be widened at run time', () => {
    expect(PUSH_SERVICE_HOSTS).toEqual([
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      '*.notify.windows.com',
      '*.push.apple.com',
    ]);
    expect(Object.isFrozen(PUSH_SERVICE_HOSTS)).toBe(true);
    expect(() => (PUSH_SERVICE_HOSTS as string[]).push('push.example.net')).toThrow();
  });
});

describe('pushEndpointUrlSchema', () => {
  it('accepts a subscription at each push service on the list', () => {
    for (const endpoint of [
      // Chrome, Android and the Chromium browsers, through FCM.
      'https://fcm.googleapis.com/fcm/send/dGVzdC1kZXZpY2U:APA91bTest',
      'https://fcm.googleapis.com/wp/dGVzdC1kZXZpY2U',
      // Firefox, through Mozilla's autopush.
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABtest',
      // Edge on Windows, through WNS: any subdomain of notify.windows.com.
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAABtest',
      'https://db5p.notify.windows.com/w/?token=BQYAAABtest',
      // Safari and Home Screen web apps, through APNs: any subdomain of push.apple.com.
      'https://web.push.apple.com/QGtestToken',
      // The host's case and an explicit default port change nothing.
      'https://FCM.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:443/fcm/send/abc',
    ]) {
      expect(refusal(endpoint), endpoint).toBeNull();
    }
  });

  it('refuses any other host, matching a wildcard only at a dot boundary', () => {
    for (const endpoint of [
      'https://push.example.net/push/abc123',
      'https://evil.example/fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/fcm/send/abc',
      'https://evilfcm.googleapis.com/fcm/send/abc',
      'https://sub.fcm.googleapis.com/fcm/send/abc',
      'https://push.services.mozilla.com/wpush/v2/abc',
      'https://updates.push.services.mozilla.com.evil.example/wpush/v2/abc',
      'https://evilnotify.windows.com.example/w/?token=abc',
      'https://evilnotify.windows.com/w/?token=abc',
      'https://notify.windows.com/w/?token=abc',
      'https://wns2-par02p.wns.windows.com/w/?token=abc',
      'https://push.apple.com/abc',
      'https://evilpush.apple.com/abc',
      'https://web.push.apple.com.evil.example/abc',
      'https://fcm.googleapis.com./fcm/send/abc',
      'https://evil.example\\@fcm.googleapis.com/fcm/send/abc',
    ]) {
      expect(refusal(endpoint), endpoint).toBe(NOT_A_PUSH_SERVICE);
    }
  });

  it('refuses an IP literal, another port and userinfo, whatever the list', () => {
    const anyList = pushEndpointUrlSchemaFor([
      ...PUSH_SERVICE_HOSTS,
      '142.250.4.95',
      '127.0.0.1',
      '[::1]',
    ]);
    for (const endpoint of [
      'https://142.250.4.95/fcm/send/abc',
      'https://127.0.0.1/push/abc',
      'https://0x7f.0.0.1/push/abc',
      'https://2130706433/push/abc',
      'https://[::1]/push/abc',
      'https://[2607:f8b0:4005:80b::200a]/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://fcm.googleapis.com:80/fcm/send/abc',
      'https://user@fcm.googleapis.com/fcm/send/abc',
      'https://user:secret@fcm.googleapis.com/fcm/send/abc',
      'https://:secret@fcm.googleapis.com/fcm/send/abc',
    ]) {
      expect(refusal(endpoint), endpoint).toBe(NOT_A_PUSH_SERVICE);
      expect(refusal(endpoint, anyList), endpoint).toBe(NOT_A_PUSH_SERVICE);
    }
  });

  it('asks for the https: URL when it is not one', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'not a url',
      'https://fcm.googleapis.com/fcm/send/has space',
      'fcm.googleapis.com/fcm/send/abc',
      'https://',
    ]) {
      expect(refusal(endpoint), endpoint).toBe('Give the https: URL the browser subscribed with.');
    }
  });

  it('takes another list for a fake push service, with the same rules', () => {
    const fake = pushEndpointUrlSchemaFor(['push.example.net', '*.push.example.org']);
    expect(refusal('https://push.example.net/push/abc', fake)).toBeNull();
    expect(refusal('https://eu.push.example.org/push/abc', fake)).toBeNull();
    expect(refusal('https://push.example.org/push/abc', fake)).toBe(NOT_A_PUSH_SERVICE);
    expect(refusal('https://fcm.googleapis.com/fcm/send/abc', fake)).toBe(NOT_A_PUSH_SERVICE);
    expect(refusal('https://push.example.net:8443/push/abc', fake)).toBe(NOT_A_PUSH_SERVICE);
    expect(isPushServiceUrl('https://push.example.net/push/abc', ['push.example.net'])).toBe(true);
    expect(isPushServiceUrl('https://push.example.net/push/abc')).toBe(false);
    expect(isPushServiceUrl('not a url', ['push.example.net'])).toBe(false);
  });
});

describe('notificationEndpointCreateSchema', () => {
  it('accepts a subscription the browser gave', () => {
    expect(
      notificationEndpointCreateSchema.safeParse({
        ...SUBSCRIPTION,
        platform: 'android',
        deviceLabel: 'Android · Chrome',
      }).success,
    ).toBe(true);
  });

  it('rejects each invalid case', () => {
    const valid = { ...SUBSCRIPTION, platform: 'android', deviceLabel: 'Android · Chrome' };
    const cases: [string, unknown][] = [
      ['a non-https endpoint', { ...valid, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' }],
      ['an endpoint off the list', { ...valid, endpoint: 'https://push.example.net/push/abc' }],
      ['a non-URL endpoint', { ...valid, endpoint: 'not a url' }],
      ['an empty endpoint', { ...valid, endpoint: '' }],
      ['missing keys', { ...valid, keys: undefined }],
      ['an empty p256dh', { ...valid, keys: { ...SUBSCRIPTION.keys, p256dh: '' } }],
      ['a non-base64url auth', { ...valid, keys: { ...SUBSCRIPTION.keys, auth: 'has spaces' } }],
      ['an unknown platform', { ...valid, platform: 'windows-phone' }],
      ['an empty label', { ...valid, deviceLabel: '' }],
      ['a 65-character label', { ...valid, deviceLabel: 'x'.repeat(65) }],
      ['an extra field', { ...valid, token: 'abc' }],
    ];
    for (const [name, body] of cases) {
      expect(notificationEndpointCreateSchema.safeParse(body).success, name).toBe(false);
    }
  });
});

describe('notificationEndpointUpdateSchema', () => {
  it('takes the endpoint and keys only', () => {
    expect(notificationEndpointUpdateSchema.safeParse(SUBSCRIPTION).success).toBe(true);
    expect(
      notificationEndpointUpdateSchema.safeParse({ ...SUBSCRIPTION, platform: 'ios' }).success,
    ).toBe(false);
    expect(
      notificationEndpointUpdateSchema.safeParse({ endpoint: SUBSCRIPTION.endpoint }).success,
    ).toBe(false);
  });

  it('refuses a rotation to a host off the list, naming the endpoint', () => {
    const parsed = notificationEndpointUpdateSchema.safeParse({
      ...SUBSCRIPTION,
      endpoint: 'https://push.example.net/push/rotated',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [['endpoint'], NOT_A_PUSH_SERVICE],
    ]);
  });
});

describe('notificationEndpointSchemasFor', () => {
  it('builds both subscription schemas over another list', () => {
    const { create, update } = notificationEndpointSchemasFor(['push.example.net']);
    const fake = { ...SUBSCRIPTION, endpoint: 'https://push.example.net/push/abc' };
    expect(update.safeParse(fake).success).toBe(true);
    expect(
      create.safeParse({ ...fake, platform: 'android', deviceLabel: 'Android · Chrome' }).success,
    ).toBe(true);
    expect(update.safeParse(SUBSCRIPTION).success).toBe(false);
    expect(update.safeParse({ ...fake, extra: true }).success).toBe(false);
  });
});

describe('notificationPrefsPatchSchema', () => {
  it('takes either switch, or both', () => {
    expect(notificationPrefsPatchSchema.safeParse({ reminders: false }).success).toBe(true);
    expect(notificationPrefsPatchSchema.safeParse({ email: true }).success).toBe(true);
    expect(notificationPrefsPatchSchema.safeParse({ reminders: true, email: false }).success).toBe(
      true,
    );
  });

  it('rejects an empty patch, an unknown switch and a non-boolean', () => {
    expect(notificationPrefsPatchSchema.safeParse({}).success).toBe(false);
    expect(notificationPrefsPatchSchema.safeParse({ sms: true }).success).toBe(false);
    expect(notificationPrefsPatchSchema.safeParse({ reminders: 'off' }).success).toBe(false);
  });
});
