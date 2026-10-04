// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Import rules from CONVENTIONS §3. Each `group` is matched against the import specifier, so the
 * rules hold for workspace names and relative paths alike.
 */
const RELATIVE_OUT_OF_PACKAGE = {
  regex: String.raw`^(\.\./)+(apps|packages)/|^(\.\./){2,}(?!src/)[a-z-]+/src(/|$)`,
  message: 'Import another workspace package by its name, never by a relative path.',
};

const LEDGER_SCHEMA = {
  regex: String.raw`(^|/)ledger/schema(\.[a-z]+)?$`,
  message: 'Only apps/api/src/ledger/** may import the ledger schema (CONVENTIONS §3).',
};

const CORE_PURITY = {
  globals: [
    'fetch',
    'process',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'window',
    'document',
  ],
  properties: [
    { object: 'Date', property: 'now', message: 'core is pure (N11): pass `today` in.' },
    { object: 'Math', property: 'random', message: 'core is pure (N11): pass ids in.' },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.vercel/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'docs/**',
      '.claude/worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [RELATIVE_OUT_OF_PACKAGE, LEDGER_SCHEMA],
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['apps/api/src/ledger/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [RELATIVE_OUT_OF_PACKAGE] },
      ],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@netnet/contracts',
              allowTypeImports: true,
              message:
                'core may import only types from @netnet/contracts, and its currency table from @netnet/contracts/currencies (CONVENTIONS §3).',
            },
          ],
          patterns: [
            RELATIVE_OUT_OF_PACKAGE,
            {
              regex: String.raw`^(?!\.{1,2}/|@netnet/contracts(/currencies)?$|d3-)`,
              message:
                'core imports only @netnet/contracts types, @netnet/contracts/currencies and d3-* maths (CONVENTIONS §3).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...CORE_PURITY.globals.map((name) => ({
          name,
          message: 'core is pure (N11): no I/O, storage or environment.',
        })),
      ],
      'no-restricted-properties': ['error', ...CORE_PURITY.properties],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'core is pure (N11): pass `today` in.',
        },
      ],
    },
  },
  {
    files: ['packages/contracts/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            RELATIVE_OUT_OF_PACKAGE,
            {
              regex: String.raw`^(?!\.{1,2}/|zod$|zod/)`,
              message: 'contracts imports only zod (CONVENTIONS §3).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            RELATIVE_OUT_OF_PACKAGE,
            {
              regex: String.raw`^@netnet/api(/|$)`,
              message: 'The web app never imports the API (CONVENTIONS §3).',
            },
            LEDGER_SCHEMA,
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'api/**/*.ts', 'test/**/*.ts', 'e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
