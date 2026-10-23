import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface InlineToken {
  file: string;
  line: number;
  expression: string;
}

/** A step's, job's or needed job's output, by name. */
const OUTPUT = /\b(?:steps|jobs|needs)\.[\w-]+\.outputs\.([\w-]+)/g;
/** Output names that say they carry a token or a secret. */
const SENSITIVE_OUTPUT = /token|secret|password|credential|database_url/i;

/**
 * Whether a `${{ … }}` expression carries a token or a secret: a refresh token anywhere, an
 * output named for one, any secret, or the workflow's own token.
 */
export function carriesToken(expression: string): boolean {
  if (/refresh_token/i.test(expression)) return true;
  if (/\bsecrets\s*[.[]|\bgithub\.token\b/.test(expression)) return true;
  return [...expression.matchAll(OUTPUT)].some(([, name]) => SENSITIVE_OUTPUT.test(name ?? ''));
}

/** A `run:` key, alone or as a sequence item's first key. */
const RUN_KEY = /^\s*(?:-\s+)?run:/;
const EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;

/**
 * Every token-carrying expression inside a `run:` script of one workflow. The runner prints a
 * script with its expressions already substituted, before any of it runs, so a value there is
 * in the log in plain text unless something masked it earlier; through `env:` the script holds
 * only the variable's name.
 */
export function inlineTokensIn(file: string, text: string): InlineToken[] {
  const lines = text.split('\n');
  const found: InlineToken[] = [];
  for (let start = 0; start < lines.length; start += 1) {
    const keyLine = lines[start] ?? '';
    if (!RUN_KEY.test(keyLine)) continue;
    // The script is the rest of the key's line, then every line indented past the key: a block
    // scalar or a plain scalar's continuation alike.
    const keyColumn = keyLine.indexOf('run:');
    const script = [keyLine.slice(keyColumn + 'run:'.length)];
    for (let next = start + 1; next < lines.length; next += 1) {
      const text = lines[next] ?? '';
      const indent = text.length - text.trimStart().length;
      if (text.trim() !== '' && indent <= keyColumn) break;
      script.push(text);
    }
    const joined = script.join('\n');
    for (const match of joined.matchAll(EXPRESSION)) {
      if (!carriesToken(match[0])) continue;
      const line = start + 1 + (joined.slice(0, match.index).match(/\n/g)?.length ?? 0);
      found.push({ file, line, expression: match[0] });
    }
  }
  return found;
}

function* workflowFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* workflowFiles(path);
    else if (/\.ya?ml$/.test(name)) yield path;
  }
}

/** Every token-carrying expression in a `run:` script under `.github/` (workflows and actions). */
export function findInlineTokens(root: string): InlineToken[] {
  const found: InlineToken[] = [];
  for (const path of workflowFiles(join(root, '.github'))) {
    const file = relative(root, path).split(sep).join('/');
    found.push(...inlineTokensIn(file, readFileSync(path, 'utf8')));
  }
  return found;
}
