import { describe, expect, it } from 'vitest';
import {
  notificationEndpointCreateSchema,
  notificationEndpointUpdateSchema,
  notificationPrefsPatchSchema,
} from './notifications';

const SUBSCRIPTION = {
  endpoint: 'https://push.example.net/push/abc123',
  keys: { p256dh: 'BEl64z-abcDEF0123456789_-', auth: 'abcDEF0123456789_-' },
};

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
      ['a non-https endpoint', { ...valid, endpoint: 'http://push.example.net/push/abc' }],
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
