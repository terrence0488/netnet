/**
 * The Vercel Node function (sin1) that vercel.json rewrites every function route to. It re-exports
 * the Hono app from apps/api, bundled by `pnpm build` into one self-contained file, because Vercel
 * compiles TypeScript file by file and cannot run workspace packages from source.
 */
export * from '@netnet/api/vercel';
