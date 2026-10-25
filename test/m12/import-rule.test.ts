import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * The Anthropic SDK's import rule (P4-T9, N2): the M12 harness is a tool the Founder runs, never
 * part of the product, so its SDK is a dependency of ops/m12 alone. The rule is checked with the
 * repository's own ESLint config, on planted snippets, the way `test/lint/import-rules.test.ts`
 * checks the others.
 */
const ROOT = resolve(import.meta.dirname, '..', '..');

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    { languageOptions: { parserOptions: { projectService: false } } },
  ],
});

/** The lines the SDK rule fires on, in `code` filed at `filePath`. */
async function sdkImports(filePath: string, code: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.line);
}

describe('the Anthropic SDK rule (N2)', () => {
  it('refuses it in apps and packages, by name or by subpath', async () => {
    for (const file of [
      'apps/api/src/planted.ts',
      'apps/web/src/planted.ts',
      'packages/core/src/planted.ts',
      'packages/contracts/src/planted.ts',
    ]) {
      expect(
        await sdkImports(file, "import Anthropic from '@anthropic-ai/sdk';"),
        file,
      ).toStrictEqual([1]);
      expect(
        await sdkImports(file, "import type { Message } from '@anthropic-ai/sdk/resources';"),
        file,
      ).toStrictEqual([1]);
    }
  });

  it('allows it in ops/m12, where the harness lives', async () => {
    expect(
      await sdkImports('ops/m12/src/model.ts', "import Anthropic from '@anthropic-ai/sdk';"),
    ).toStrictEqual([]);
  });

  it('leaves every other import alone', async () => {
    expect(await sdkImports('apps/api/src/planted.ts', "import { z } from 'zod';")).toStrictEqual(
      [],
    );
  });
});
