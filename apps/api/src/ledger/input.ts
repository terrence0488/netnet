import type { ErrorCode } from '@netnet/contracts';
import { AppError } from '../lib/errors';

/**
 * Checking what a caller gives the Ledger (CONVENTIONS §11, PRD J6): every problem is named by its
 * path, such as `values[3].amount`, with what to give instead, so an agent can correct itself.
 * Nothing is written until every item has passed.
 */

/** The codes a field can fail with (architecture §7.5). */
export type FieldErrorCode = Extract<
  ErrorCode,
  'VALIDATION_FAILED' | 'OUT_OF_RANGE' | 'CURRENCY_UNSUPPORTED' | 'NOT_FOUND'
>;

/** How many problems the error's message spells out; `fields` has them all. */
const MESSAGE_FIELDS = 3;

/** Every problem with an input. The error's code is the first problem's. */
export class FieldErrors {
  private code: FieldErrorCode | undefined;
  private readonly fields: Record<string, string> = {};

  add(code: FieldErrorCode, path: string, message: string): void {
    this.code ??= code;
    if (!Object.hasOwn(this.fields, path)) this.fields[path] = message;
  }

  get empty(): boolean {
    return this.code === undefined;
  }

  /** Throws the AppError for what was added, if anything was. */
  throwIfAny(): void {
    if (this.code === undefined) return;
    const entries = Object.entries(this.fields);
    const listed = entries
      .slice(0, MESSAGE_FIELDS)
      .map(([path, message]) => `${path}: ${message}`)
      .join(' ');
    const more =
      entries.length > MESSAGE_FIELDS ? ` (${entries.length} problems; see fields.)` : '';
    throw new AppError(this.code, `${listed}${more}`, { fields: { ...this.fields } });
  }
}

/** `values` + `[3, 'amount']` → `values[3].amount`. */
export function fieldPath(root: string | undefined, path: readonly PropertyKey[]): string {
  let out = root ?? '';
  for (const key of path) {
    out += typeof key === 'number' ? `[${key}]` : `${out ? '.' : ''}${String(key)}`;
  }
  return out || 'input';
}

/** What a contract's zod schema offers: the API reads it without depending on zod itself. */
interface Schema<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly {
            code: string;
            path: PropertyKey[];
            message: string;
            keys?: string[];
          }[];
        };
      };
}

/**
 * `input` parsed by its contract schema, or VALIDATION_FAILED naming each bad field under `root`
 * (`values` for `recordValues`' list).
 */
export function parseInput<T>(schema: Schema<T>, input: unknown, root?: string): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors = new FieldErrors();
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys' && issue.keys) {
      for (const key of issue.keys) {
        errors.add(
          'VALIDATION_FAILED',
          fieldPath(root, [...issue.path, key]),
          'This is not a field here: remove it, or check its spelling.',
        );
      }
    } else {
      errors.add('VALIDATION_FAILED', fieldPath(root, issue.path), issue.message);
    }
  }
  errors.throwIfAny();
  throw new Error('unreachable: a failed parse has issues');
}

/** NOT_FOUND for an id passed as a method's own argument. */
export function notFound(what: string, id: string): AppError {
  return new AppError('NOT_FOUND', `There is no ${what} ${quoted(id)} in this account.`);
}

/** An id or code as it may appear in a message: quoted, and cut short if long. */
export function quoted(text: string): string {
  return `"${text.length > 64 ? `${text.slice(0, 64)}…` : text}"`;
}
