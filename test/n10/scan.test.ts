import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import denyList from './deny-list.json' with { type: 'json' };
import { scanForLocalKnowledge } from './scan';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

/** Planted terms come from the list itself, so this file carries none of them. */
const [WORD = '', ...otherWords] = denyList.caseSensitive;
const [ANY_CASE = '', PUNCTUATED = ''] = denyList.caseInsensitive;

describe('N10: no local knowledge in code', () => {
  it('finds no deny-listed term in source outside content/ and docs/', () => {
    expect(scanForLocalKnowledge(REPO_ROOT, denyList)).toStrictEqual([]);
  });

  describe('the scan itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'n10-'));
    const plant = (path: string, text: string) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    plant('apps/api/src/defaults.ts', `export const LOCKED = ['x', '${WORD} OA'];\n`);
    plant(
      'packages/core/src/rules.ts',
      `const note = "Your ${ANY_CASE.toLowerCase()} is locked";\n`,
    );
    plant('apps/web/src/copy.json', `{ "hint": "like a ${PUNCTUATED}" }\n`);
    plant('content/packs/xx.json', `{ "type": "${WORD}" }\n`);
    plant('docs/notes.md', `${WORD} is locked.\n`);
    plant('docs/notes.ts', `const ${WORD} = 1;\n`);
    plant(
      'apps/api/src/clean.ts',
      `const V${WORD} = 1; const ${WORD.toLowerCase()} = 2; const ${WORD}_X = 3;\n`,
    );

    const matches = scanForLocalKnowledge(root, denyList);

    it('catches planted terms, whole words, with the right case rule', () => {
      expect(otherWords.length).toBeGreaterThan(0);
      expect(matches).toStrictEqual([
        { file: 'apps/api/src/defaults.ts', line: 1, term: WORD },
        { file: 'apps/web/src/copy.json', line: 1, term: PUNCTUATED },
        { file: 'packages/core/src/rules.ts', line: 1, term: ANY_CASE },
      ]);
    });

    it('catches every listed term, the launch markets’ schemes and wrappers among them', () => {
      const every = mkdtempSync(join(tmpdir(), 'n10-every-'));
      try {
        const terms = [
          ...denyList.caseSensitive,
          ...denyList.caseInsensitive.map((t) => t.toUpperCase()),
        ];
        mkdirSync(join(every, 'apps', 'web', 'src'), { recursive: true });
        writeFileSync(
          join(every, 'apps', 'web', 'src', 'planted.ts'),
          terms.map((t) => `const note = "a ${t} account";`).join('\n'),
        );
        const found = scanForLocalKnowledge(every, denyList);
        expect(found.map((m) => m.line)).toStrictEqual(terms.map((_, i) => i + 1));
        expect(denyList.caseSensitive.length).toBeGreaterThan(40);
      } finally {
        rmSync(every, { recursive: true, force: true });
      }
    });

    it('leaves content/ and docs/ alone', () => {
      expect(matches.some((m) => m.file.startsWith('content/') || m.file.startsWith('docs/'))).toBe(
        false,
      );
    });
  });
});
