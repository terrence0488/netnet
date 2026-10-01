import type { ErrorCode } from '@netnet/contracts';

/**
 * Details that travel with an error to the caller. `fields` names each bad field and the allowed
 * form; other keys are code-specific (for example `candidates` with LIKELY_DUPLICATE).
 */
export type ErrorDetails = { fields?: Record<string, string> } & Record<string, unknown>;

/** The only error the API throws on purpose (CONVENTIONS §11). */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
