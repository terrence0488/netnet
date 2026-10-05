/**
 * `pnpm content:images`: copies `content/images/` to `dist/content/images/`, so the built app
 * serves screenshots and logos as static files at `/content/*` (architecture §7.1). Runs as the
 * last step of `pnpm build`; a content-only deploy runs the build and ships `dist/`.
 */
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FROM = join(ROOT, 'content', 'images');
const TO = join(ROOT, 'dist', 'content', 'images');

/** Image files ship; notes to the humans adding them (README.md) stay behind. */
const IMAGE = /\.(png|jpg|jpeg|webp|svg)$/i;

mkdirSync(TO, { recursive: true });
if (existsSync(FROM)) {
  cpSync(FROM, TO, {
    recursive: true,
    filter: (path) => statSync(path).isDirectory() || IMAGE.test(path),
  });
  console.log(`content:images: content/images/ -> dist/content/images/`);
} else {
  console.log('content:images: no content/images/, nothing to copy');
}
