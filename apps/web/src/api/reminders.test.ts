import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportReminderOpened, unsubscribeEmailReminders, withoutReminderParam } from './reminders';

const fetchMock = vi.fn<typeof fetch>();
const TOKEN = 'r1.test-payload.test-signature';

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function error(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'No.' } }), { status });
}

describe('reportReminderOpened()', () => {
  it('posts the token, and never rejects', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await reportReminderOpened(TOKEN);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/reminders/opened');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toStrictEqual({ token: TOKEN });

    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(reportReminderOpened(TOKEN)).resolves.toBeUndefined();
    fetchMock.mockResolvedValue(error(404, 'NOT_FOUND'));
    await expect(reportReminderOpened(TOKEN)).resolves.toBeUndefined();
  });
});

describe('unsubscribeEmailReminders()', () => {
  it('posts the token and tells off, invalid and error apart', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(unsubscribeEmailReminders(TOKEN)).resolves.toBe('off');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/reminders/unsubscribe');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toStrictEqual({ token: TOKEN });

    fetchMock.mockResolvedValue(error(404, 'NOT_FOUND'));
    await expect(unsubscribeEmailReminders(TOKEN)).resolves.toBe('invalid');
    fetchMock.mockResolvedValue(error(429, 'RATE_LIMITED'));
    await expect(unsubscribeEmailReminders(TOKEN)).resolves.toBe('error');
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(unsubscribeEmailReminders(TOKEN)).resolves.toBe('error');
  });
});

describe('withoutReminderParam()', () => {
  it('drops ?r= and keeps the rest', () => {
    expect(withoutReminderParam(`?r=${TOKEN}`)).toBe('');
    expect(withoutReminderParam(`?r=${TOKEN}&tab=agent`)).toBe('?tab=agent');
    expect(withoutReminderParam('?tab=agent')).toBe('?tab=agent');
    expect(withoutReminderParam('')).toBe('');
  });
});
