import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface DenyList {
  caseSensitive: string[];
  caseInsensitive: string[];
}

export interface Match {
  file: string;
  line: number;
  term: string;
}

/** Directories never scanned: content and docs hold local knowledge by design. */
const SKIPPED_DIRS = new Set([
  'content',
  'docs',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.git',
  '.vercel',
  '.claude',
]);

const SCANNED = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|sql|ya?ml)$/;
const SKIPPED_FILES = new Set(['pnpm-lock.yaml', join('test', 'n10', 'deny-list.json')]);

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A term as a whole word: not inside a longer identifier or word. */
function wordPattern(term: string, flags: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escape(term)}(?![A-Za-z0-9_])`, flags);
}

function* files(root: string, dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRS.has(name)) yield* files(root, path);
    } else if (SCANNED.test(name) && !SKIPPED_FILES.has(relative(root, path))) {
      yield path;
    }
  }
}

/** Every deny-listed term in source under `root`, outside content/ and docs/. */
export function scanForLocalKnowledge(root: string, denyList: DenyList): Match[] {
  const patterns = [
    ...denyList.caseSensitive.map((term) => ({ term, re: wordPattern(term, '') })),
    ...denyList.caseInsensitive.map((term) => ({ term, re: wordPattern(term, 'i') })),
  ];
  const matches: Match[] = [];
  for (const path of files(root, root)) {
    const lines = readFileSync(path, 'utf8').split('\n');
    lines.forEach((text, index) => {
      for (const { term, re } of patterns) {
        if (re.test(text)) {
          matches.push({ file: relative(root, path).split(sep).join('/'), line: index + 1, term });
        }
      }
    });
  }
  return matches;
}
