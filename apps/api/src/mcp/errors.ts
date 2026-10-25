import type { Candidate, ErrorCode, McpCandidate, McpError } from '@netnet/contracts';
import { fromMinor } from '@netnet/core';
import { ConnectionRevoked } from '../ledger/with-user';
import { AppError, type ErrorDetails } from '../lib/errors';
import { errorClass, log } from '../lib/log';

/**
 * What a failed tool call answers (architecture §7.5): `isError: true` with
 * `structuredContent.error {code, message, fields?}` and the code's own details beside them. The
 * Ledger's camelCase field paths are renamed to the tool's snake_case parameters, so the agent is
 * told what to change in the words it called with.
 */

/** `holdingId` → `holding_id`; an id or index is left as it is. */
function snake(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * The Ledger's field paths as this tool names them: `renames` maps the segments whose MCP name
 * is not the snake_case of the Ledger's (`access` → `access_answer`); every other segment is
 * snake_cased.
 */
export function renamePaths(
  fields: Record<string, string>,
  renames: Record<string, string>,
): Record<string, string> {
  const renamed: Record<string, string> = {};
  for (const [path, message] of Object.entries(fields)) {
    const segments = path.match(/[A-Za-z0-9_]+|\[\d+\]/g) ?? [];
    let out = '';
    for (const segment of segments) {
      out += segment.startsWith('[')
        ? segment
        : `${out === '' ? '' : '.'}${renames[segment] ?? snake(segment)}`;
    }
    renamed[out === '' ? path : out] = message;
  }
  return renamed;
}

/** `LIKELY_DUPLICATE`'s candidates with amounts in major units, as the outputs carry them. */
function candidatesOf(candidates: unknown): McpCandidate[] | undefined {
  if (!Array.isArray(candidates)) return undefined;
  return (candidates as Candidate[]).map((c) => ({
    id: c.id,
    name: c.name,
    latest:
      c.latest === null
        ? null
        : {
            date: c.latest.date,
            amount: Number(fromMinor(c.latest.amountMinor, c.latest.currency)),
            currency: c.latest.currency,
          },
  }));
}

/** The tool needs `scope`: the connection was granted the other one. */
export function scopeRequired(scope: 'ledger.read' | 'ledger.write'): AppError {
  const what = scope === 'ledger.write' ? 'write' : 'read';
  return new AppError(
    'SCOPE_REQUIRED',
    `This needs the ${scope} scope. Reconnect NetNet in your agent and allow it to ${what}.`,
  );
}

/** A revoked connection's call inside its transaction (the route rejects it first; a race). */
function revoked(): { code: ErrorCode; message: string } {
  return {
    code: 'UNAUTHENTICATED',
    message: 'This agent connection was revoked. Reconnect NetNet in your agent.',
  };
}

function internal(requestId: string): { code: ErrorCode; message: string; requestId: string } {
  return {
    code: 'INTERNAL',
    message: `Something went wrong on our side. Try again; if it keeps happening, quote request id ${requestId}.`,
    requestId,
  };
}

export interface ToolFailure {
  code: ErrorCode;
  body: McpError;
}

/**
 * Any error a tool raises as the failure it answers with. Deliberate errors keep their code,
 * message and details, with the Ledger's paths renamed by `renames`, or left as they are when it
 * is null (the tool's own schema refused the arguments, naming them as the agent sent them);
 * anything else is logged with the request id and its class (architecture §10) and answered
 * INTERNAL, and its message, stack and SQL never leave here (CONVENTIONS §11).
 */
export function toMcpError(
  error: unknown,
  renames: Record<string, string> | null,
  requestId: string,
  tool: string,
): ToolFailure {
  if (error instanceof AppError && error.code !== 'INTERNAL') {
    const details: ErrorDetails = error.details ?? {};
    const { fields, candidates, ...rest } = details;
    return {
      code: error.code,
      body: {
        error: {
          ...(fields === undefined
            ? {}
            : { fields: renames === null ? { ...fields } : renamePaths(fields, renames) }),
          ...rest,
          ...(candidates === undefined ? {} : { candidates: candidatesOf(candidates) }),
          code: error.code,
          message: error.message,
        },
      },
    };
  }
  if (error instanceof ConnectionRevoked) {
    const failed = revoked();
    return { code: failed.code, body: { error: failed } };
  }
  log('tool_failed', { requestId, tool, errorCode: 'INTERNAL', ...errorClass(error) });
  const failed = internal(requestId);
  return { code: failed.code, body: { error: failed } };
}
