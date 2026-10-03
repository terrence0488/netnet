/**
 * The version every event carries (`app_version`, architecture §6.4): the deployed commit,
 * shortened, from Vercel's `VERCEL_GIT_COMMIT_SHA`. `dev` when there is none, as in local runs.
 * The web app and the API deploy together, so client events carry it too: a version the browser
 * sent would be free text.
 */
export function appVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : 'dev';
}
