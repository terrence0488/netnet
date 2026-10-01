import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/** CONVENTIONS §3's import rules, checked on planted snippets with the repo's own ESLint config. */
const eslint = new ESLint({
  cwd: resolve(import.meta.dirname, '..', '..'),
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    { languageOptions: { parserOptions: { projectService: false } } },
  ],
});

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) =>
      [
        '@typescript-eslint/no-restricted-imports',
        'no-restricted-globals',
        'no-restricted-properties',
        'no-restricted-syntax',
      ].includes(m.ruleId ?? ''),
    )
    .map((m) => `${m.line}:${m.ruleId}`);
}

describe('import rules (CONVENTIONS §3)', () => {
  it('core imports only contracts types and d3-*, and stays pure', async () => {
    const code = [
      "import type { ErrorCode } from '@netnet/contracts';",
      "import { scaleLinear } from 'd3-scale';",
      "import { helper } from './helper';",
      "import { ERROR_STATUS } from '@netnet/contracts';",
      "import { z } from 'zod';",
      'export const t = [Date.now(), Math.random(), new Date(), process.env.X, fetch];',
    ].join('\n');
    expect(await violations('packages/core/src/planted.ts', code)).toStrictEqual([
      '4:@typescript-eslint/no-restricted-imports',
      '5:@typescript-eslint/no-restricted-imports',
      '6:no-restricted-properties',
      '6:no-restricted-properties',
      '6:no-restricted-syntax',
      '6:no-restricted-globals',
      '6:no-restricted-globals',
    ]);
  });

  it('contracts imports only zod', async () => {
    const code = "import { z } from 'zod';\nimport { Hono } from 'hono';";
    expect(await violations('packages/contracts/src/planted.ts', code)).toStrictEqual([
      '2:@typescript-eslint/no-restricted-imports',
    ]);
  });

  it('web never imports the API, by name or by path', async () => {
    const code = [
      "import { tokens } from '@netnet/tokens';",
      "import { client } from '../api/client';",
      "import { app } from '@netnet/api';",
      "import { GET } from '@netnet/api/vercel';",
      "import { x } from '../../api/src/app';",
    ].join('\n');
    expect(await violations('apps/web/src/routes/planted.ts', code)).toStrictEqual([
      '3:@typescript-eslint/no-restricted-imports',
      '4:@typescript-eslint/no-restricted-imports',
      '5:@typescript-eslint/no-restricted-imports',
    ]);
  });

  it('only apps/api/src/ledger/** imports the ledger schema', async () => {
    const outside = "import * as schema from '../ledger/schema';";
    expect(await violations('apps/api/src/http/planted.ts', outside)).toStrictEqual([
      '1:@typescript-eslint/no-restricted-imports',
    ]);
    expect(
      await violations('apps/api/src/ledger/planted.ts', "import * as s from './schema';"),
    ).toStrictEqual([]);
  });

  it('workspace packages are imported by name, never by a relative path', async () => {
    const code = "import { app } from '../apps/api/src/app';";
    expect(await violations('test/planted.ts', code)).toStrictEqual([
      '1:@typescript-eslint/no-restricted-imports',
    ]);
  });
});
