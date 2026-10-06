/** Environment the build reads (vite.config.ts `envPrefix`). */
interface ImportMetaEnv {
  /** `production` on a production deploy, `preview` on a preview; unset locally and in CI. */
  readonly VERCEL_ENV?: string;
  /** Sentry's DSN, baked into the build; unset, errors stay in the console. */
  readonly VITE_SENTRY_DSN?: string;
}
