const VERCEL_REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

export interface CapturedWaitUntil {
  /** How many tasks were handed to waitUntil and not yet settled. */
  readonly pending: number;
  /** Awaits every task handed over so far, and any they hand over in turn. */
  settle(): Promise<void>;
  restore(): void;
}

/**
 * Stands in for Vercel's request context, as the function runtime installs it, and collects what
 * `afterResponse` hands to `waitUntil`, so a test can await the work done after a response.
 */
export function captureWaitUntil(): CapturedWaitUntil {
  const tasks: Promise<unknown>[] = [];
  const holder = globalThis as Record<symbol, unknown>;
  const previous = holder[VERCEL_REQUEST_CONTEXT];
  holder[VERCEL_REQUEST_CONTEXT] = {
    get: () => ({ waitUntil: (task: Promise<unknown>) => void tasks.push(task) }),
  };
  return {
    get pending() {
      return tasks.length;
    },
    async settle() {
      while (tasks.length > 0) await Promise.all(tasks.splice(0));
    },
    restore() {
      if (previous === undefined) delete holder[VERCEL_REQUEST_CONTEXT];
      else holder[VERCEL_REQUEST_CONTEXT] = previous;
    },
  };
}
