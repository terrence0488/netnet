/**
 * What one account screen hands the next through the router's navigation state: the email typed,
 * so it is not asked twice, and why the person was sent there. It lives in the tab's history entry
 * only, and is read defensively, since history can hold anything.
 */
export interface Handoff {
  readonly email?: string;
  /** Why log-in was opened: the address already has an account, or the password was changed. */
  readonly notice?: 'existing' | 'reset';
  /** A problem to show on arrival, such as an address the server refused. */
  readonly problem?: string;
}

export function handoffOf(state: unknown): Handoff {
  if (typeof state !== 'object' || state === null) return {};
  const { email, notice, problem } = state as Record<string, unknown>;
  return {
    ...(typeof email === 'string' ? { email } : {}),
    ...(notice === 'existing' || notice === 'reset' ? { notice } : {}),
    ...(typeof problem === 'string' ? { problem } : {}),
  };
}
