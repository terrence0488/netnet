import { errorBodySchema, type ErrorCode } from '@netnet/contracts';

/**
 * The typed REST client (architecture §7.2). Requests go to /api on the app's own origin, with the
 * session cookie. Response types come from packages/contracts; an error body becomes an ApiError.
 */

const API_BASE = '/api';

/** A path under /api, written with its leading slash: `/me`, `/holdings/hld_…`. */
export type ApiPath = `/${string}`;

/** The contract's error codes, plus NETWORK when no response arrived at all. */
export type ApiErrorCode = ErrorCode | 'NETWORK';

export interface RequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

interface ApiErrorInit {
  code: ApiErrorCode;
  status: number;
  message: string;
  fields?: Readonly<Record<string, string>> | undefined;
  requestId?: string | undefined;
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

/**
 * An error from the API, typed by its code. `message` is for logs and agents, never for the
 * screen: what a person reads comes from the code (CONVENTIONS §11, ErrorState).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly code: ApiErrorCode;
  /** The HTTP status, or 0 for NETWORK. */
  readonly status: number;
  /** Each bad field and the form it allows (VALIDATION_FAILED). */
  readonly fields: Readonly<Record<string, string>>;
  readonly requestId: string | undefined;
  /** Code-specific details beside the code, such as `candidates` or `blockers`. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this.code = init.code;
    this.status = init.status;
    this.fields = init.fields ?? {};
    this.requestId = init.requestId;
    this.details = init.details ?? {};
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

async function toApiError(response: Response): Promise<ApiError> {
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

export interface Sent<T> {
  readonly status: number;
  /** Undefined for 204 and 304. */
  readonly data: T | undefined;
  readonly etag: string | null;
}

/** One request, without opinions about 304: the building block for `api` and conditional GETs. */
export async function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: ApiPath,
  body?: unknown,
  options: RequestOptions = {},
): Promise<Sent<T>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    // A cancelled query is not a failure: let the abort through untouched.
    if (options.signal?.aborted) throw cause;
    throw new ApiError({
      code: 'NETWORK',
      status: 0,
      message: `${method} ${path} did not reach the server.`,
      cause,
    });
  }
  const etag = response.headers.get('ETag');
  if (response.status === 204 || response.status === 304) {
    return { status: response.status, data: undefined, etag };
  }
  if (!response.ok) throw await toApiError(response);
  try {
    return { status: response.status, data: (await response.json()) as T, etag };
  } catch (cause) {
    throw new ApiError({
      code: 'INTERNAL',
      status: response.status,
      message: `${method} ${path} answered ${response.status} without a JSON body.`,
      cause,
    });
  }
}

/** A warning beside a write's result, such as `SAME_DATE_REPLACED` (architecture §7.2). */
export interface WriteWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * What every write returns (architecture §7.2): `api.post<Written<Holding>>('/holdings', …)`. Its
 * `dataVersion` moves the snapshot on by itself (see query.tsx).
 */
export interface Written<T> {
  readonly result: T;
  readonly dataVersion: number;
  readonly warnings: readonly WriteWarning[];
}

async function dataOf<T>(sent: Promise<Sent<T>>): Promise<T> {
  return (await sent).data as T;
}

/**
 * `T` is the response type from packages/contracts, e.g. `api.get<Me>('/me')`. A 204 resolves to
 * undefined, so type those calls `<void>`. A GET carries no body.
 */
export const api = {
  get: <T>(path: ApiPath, options?: RequestOptions) =>
    dataOf(send<T>('GET', path, undefined, options)),
  post: <T>(path: ApiPath, body?: unknown, options?: RequestOptions) =>
    dataOf(send<T>('POST', path, body, options)),
  put: <T>(path: ApiPath, body?: unknown, options?: RequestOptions) =>
    dataOf(send<T>('PUT', path, body, options)),
  patch: <T>(path: ApiPath, body?: unknown, options?: RequestOptions) =>
    dataOf(send<T>('PATCH', path, body, options)),
  del: <T>(path: ApiPath, body?: unknown, options?: RequestOptions) =>
    dataOf(send<T>('DELETE', path, body, options)),
};
