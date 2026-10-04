import type { Segment } from '@netnet/contracts';

/** The signed-in person as a route sees them. */
export interface SessionUser {
  /** The verified user id (`usr_…`), the only one `withUser` may be given (CONVENTIONS §3). */
  userId: string;
  /** Whether the account's email is verified: connecting an agent needs it (PRD J1, J5). */
  emailVerified: boolean;
  /** Set when the profile was loaded with the session; `track()` reads it itself otherwise. */
  segment?: Segment;
}

/** Hono's typed context for every route: what middleware sets on `c`. */
export interface AppEnv {
  Variables: {
    requestId: string;
    /**
     * The signed-in person, or null when there is no valid session. Resolved on the first call
     * and remembered for the rest of the request (see `sessionContext`).
     */
    session: () => Promise<SessionUser | null>;
  };
}
