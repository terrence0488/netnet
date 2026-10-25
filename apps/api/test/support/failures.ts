import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { vi } from 'vitest';

/**
 * Unexpected errors for the failure logs' tests (architecture §10): each carries a message, SQL
 * and values that a log line must never show. All of it is fictional (CONVENTIONS §6).
 */

/** A unique violation as Drizzle wraps it: its SQL, its parameters and the driver's error. */
export function drizzleFailure(): DrizzleQueryError {
  const postgres = new DatabaseError(
    'duplicate key value violates unique constraint "profile_pkey"',
    62,
    'error',
  );
  postgres.severity = 'ERROR';
  postgres.code = '23505';
  postgres.detail = 'Key (note)=(Kestrel Savings 98765.43) already exists.';
  return new DrizzleQueryError(
    'insert into "core"."profile" ("user_id", "note") values ($1, $2)',
    ['usr_01K1G4KX00AAAAAAAAAAAAAAAA', 'Kestrel Savings 98765.43 for kestrel@example.com'],
    postgres,
  );
}

/** A plain error whose message names a holding, an amount and an email. */
export function plainFailure(): TypeError {
  return new TypeError('Cannot read "Kestrel Savings" (98765.43) of kestrel@example.com');
}

/** Anything of `drizzleFailure()`'s or `plainFailure()`'s message, SQL or values. */
export const LEAKS =
  /duplicate|constraint|profile_pkey|insert into|kestrel|98765|example\.com|cannot read/i;

export interface CapturedLog {
  /** Every line written to stdout or stderr, as written. */
  raw(): string[];
  /** The JSON lines `log()` wrote. */
  lines(): Record<string, unknown>[];
  /** The JSON lines of one event. */
  of(event: string): Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Captures what is written to stdout and stderr until `vi.restoreAllMocks()`. */
export function captureLog(): CapturedLog {
  const written: string[] = [];
  for (const method of ['log', 'error', 'warn'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      // An error's String() carries its message, so a stack dumped to stderr is caught too.
      written.push(args.map(String).join(' '));
    });
  }
  const lines = (): Record<string, unknown>[] =>
    written.flatMap((line) => {
      try {
        const parsed: unknown = JSON.parse(line);
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
  return {
    raw: () => [...written],
    lines,
    of: (event) => lines().filter((line) => line.event === event),
  };
}
