import { chromium, defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * E2E runs against the built app (e2e/server.ts), or against a deployed URL when E2E_BASE_URL is
 * set (CI's preview check).
 */
const PORT = 3100;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Claude Code cloud sessions ship one preinstalled Chromium and must never run
 * `playwright install`; use it when this Playwright version's own build is absent.
 */
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  !existsSync(chromium.executablePath()) && existsSync(PREINSTALLED_CHROMIUM)
    ? PREINSTALLED_CHROMIUM
    : undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [
    // A phone is touch, the reference case: `pointer: coarse`, so hit targets are 44px
    // (design-system §6.1). The computer has a mouse, where they relax to 36px.
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        launchOptions,
      },
    },
    {
      name: 'computer',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, launchOptions },
    },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'tsx e2e/server.ts',
          url: `${BASE_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          env: { PORT: String(PORT) },
        },
      }),
});
