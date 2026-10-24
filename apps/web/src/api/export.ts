import { errorBodySchema, type ExportFormat } from '@netnet/contracts';
import { ApiError } from './client';

/**
 * Taking the data away (PRD J10): `GET /api/export?format=` as a file download. The client builds
 * the download from the response (the prototype's Export screen), so the route stays a plain GET.
 */

/** The export's URL: JSON is the full bundle, CSV one flat values table. */
export function exportUrl(format: ExportFormat): string {
  return `/api/export?format=${format}`;
}

/** The file the download saves as. */
export function exportFilename(format: ExportFormat): string {
  return `netnet-export.${format}`;
}

/**
 * How long the saved file's object URL lives after the click. Revoking it in the click's own task
 * has cancelled the download in Safari, which may also ask before it saves (iOS): a minute later
 * the download is under way. Leaving the page frees it too.
 */
export const EXPORT_URL_LIFETIME_MS = 60_000;

/** The response's MIME type: JSON parses, CSV saves as text. */
function mimeOf(format: ExportFormat): string {
  return format === 'json' ? 'application/json' : 'text/csv';
}

/**
 * Downloads the export: fetches it with the session cookie and saves it under `exportFilename`.
 * A refused fetch throws the API's error (to word on the screen); anything else throws NETWORK.
 */
export async function downloadExport(format: ExportFormat): Promise<void> {
  let response: Response;
  try {
    response = await fetch(exportUrl(format), { credentials: 'same-origin' });
  } catch (cause) {
    throw new ApiError({
      code: 'NETWORK',
      status: 0,
      message: `GET ${exportUrl(format)} did not reach the server.`,
      cause,
    });
  }
  if (!response.ok) throw await exportError(response);
  const blob = new Blob([await response.blob()], { type: `${mimeOf(format)};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(format);
    link.click();
  } finally {
    // In a later task, once the download has started: never in the click's.
    setTimeout(() => URL.revokeObjectURL(url), EXPORT_URL_LIFETIME_MS);
  }
}

async function exportError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) {
    return new ApiError({
      code: 'INTERNAL',
      status: response.status,
      message: `Unexpected ${response.status} response without an error body.`,
    });
  }
  const { code, message, fields, requestId, ...details } = parsed.data.error;
  return new ApiError({ code, status: response.status, message, fields, requestId, details });
}
