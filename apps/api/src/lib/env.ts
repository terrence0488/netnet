/** True only on the production deployment. Previews and local runs are stricter. */
export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}
