import { defineConfig } from 'vitest/config';

/**
 * One Vitest run over every package. `pnpm test` runs all projects but `integration`;
 * `pnpm test:int` runs `integration` against Postgres (DATABASE_URL).
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: 'packages/core', include: ['src/**/*.test.ts'] } },
      { test: { name: 'contracts', root: 'packages/contracts', include: ['src/**/*.test.ts'] } },
      { test: { name: 'tokens', root: 'packages/tokens', include: ['src/**/*.test.ts'] } },
      { test: { name: 'api', root: 'apps/api', include: ['src/**/*.test.ts'] } },
      { test: { name: 'web', root: 'apps/web', include: ['src/**/*.test.{ts,tsx}'] } },
      { test: { name: 'repo', root: 'test', include: ['**/*.test.ts'] } },
      {
        test: {
          name: 'integration',
          root: 'apps/api',
          include: ['test/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
