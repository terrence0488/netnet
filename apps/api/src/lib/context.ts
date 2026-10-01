/** Hono's typed context for every route: what middleware sets on `c`. */
export interface AppEnv {
  Variables: {
    requestId: string;
  };
}
