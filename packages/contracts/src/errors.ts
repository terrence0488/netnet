import { z } from 'zod';

/** Every error code a caller can receive, with its HTTP status (architecture §7.5). */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  OUT_OF_RANGE: 400,
  CURRENCY_UNSUPPORTED: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  LIKELY_DUPLICATE: 409,
  UNDO_CONFLICT: 409,
  EMAIL_NOT_VERIFIED: 403,
  SCOPE_REQUIRED: 403,
  REAUTH_REQUIRED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode];

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];

export const errorCodeSchema = z.enum(ERROR_CODES);

/**
 * The body of every error response. `fields` names each bad field and the allowed form
 * (VALIDATION_FAILED); `requestId` comes with INTERNAL. Code-specific details, such as
 * `candidates` or `blockers`, sit beside them.
 */
export const errorBodySchema = z.object({
  error: z.looseObject({
    code: errorCodeSchema,
    message: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
    requestId: z.string().optional(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;
