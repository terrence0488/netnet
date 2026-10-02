/** Environment the build reads (vite.config.ts `envPrefix`). */
interface ImportMetaEnv {
  /** `production` on a production deploy, `preview` on a preview; unset locally and in CI. */
  readonly VERCEL_ENV?: string;
}
