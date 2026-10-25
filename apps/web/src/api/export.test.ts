import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from './client';
import { EXPORT_URL_LIFETIME_MS, downloadExport, exportFilename, exportUrl } from './export';

/**
 * Taking the data away (PRD J10): the export's URL and filename, and the download itself — the
 * file saved under its name, its URL revoked only once the download is under way, the server's
 * error kept as an ApiError. All data is fictional.
 */
describe('exportUrl and exportFilename', () => {
  it('names the route and the file per format', () => {
    expect(exportUrl('json')).toBe('/api/export?format=json');
    expect(exportUrl('csv')).toBe('/api/export?format=csv');
    expect(exportFilename('json')).toBe('netnet-export.json');
    expect(exportFilename('csv')).toBe('netnet-export.csv');
  });
});

describe('downloadExport', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const clicked: { href: string; download: string }[] = [];
  const click = vi.fn<() => void>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal(
      'fetch',
      fetchMock.mockImplementation((url: string | URL | Request) =>
        Promise.resolve(
          new Response(`body of ${url instanceof Request ? url.url : String(url)}`, {
            status: 200,
            headers: { 'Content-Type': 'text/csv' },
          }),
        ),
      ),
    );
    clicked.length = 0;
    vi.stubGlobal('document', {
      createElement: () => ({
        set href(value: string) {
          clicked.push({ href: value, download: '' });
        },
        set download(value: string) {
          clicked[clicked.length - 1]!.download = value;
        },
        click,
      }),
    });
    click.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches the export and saves it under its name', async () => {
    await downloadExport('csv');
    expect(fetchMock).toHaveBeenCalledWith('/api/export?format=csv', {
      credentials: 'same-origin',
    });
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.href.startsWith('blob:')).toBe(true);
    expect(clicked[0]!.download).toBe('netnet-export.csv');
  });

  it('revokes the file’s URL only after the download has started, in a later task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    // Revoked during the click, the download would be cancelled (Safari).
    click.mockImplementation(() => expect(revoke).not.toHaveBeenCalled());

    await downloadExport('json');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();

    // Not in the next task either, but once the download is under way.
    await vi.advanceTimersByTimeAsync(EXPORT_URL_LIFETIME_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(clicked[0]!.href);
  });

  it('keeps the server’s error as an ApiError', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }), {
          status: 401,
        }),
      ),
    );
    const error = await downloadExport('json').catch((e: unknown) => e);
    expect(isApiError(error, 'UNAUTHENTICATED')).toBe(true);
    expect(clicked).toHaveLength(0);
  });

  it('throws NETWORK when nothing answers', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'));
    const error = await downloadExport('json').catch((e: unknown) => e);
    expect(isApiError(error, 'NETWORK')).toBe(true);
  });
});
