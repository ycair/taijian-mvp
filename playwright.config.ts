import { defineConfig } from '@playwright/test';

/**
 * Local acceptance E2E. Requires the Firebase emulators (`pnpm emulators`)
 * and the mock LINE server (`pnpm mock:line`) in separate terminals;
 * `global-setup.ts` reseeds the emulator before the suite. Vite is started by
 * Playwright. This is not wired into CI yet.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'pnpm --filter @taijian/liff dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
