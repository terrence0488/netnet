import { handle } from 'hono/vercel';
import { app } from './app';

/**
 * The app as Vercel's Node function exports it: one handler per method. `pnpm build` bundles this
 * file into dist/vercel.js, which api/index.ts re-exports.
 */
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
